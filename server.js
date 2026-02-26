const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =============================
   DIRECTORY SETUP
============================= */

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const STARRED_FILE = path.join(DATA_DIR, "starred.json");

if (!fs.existsSync(STARRED_FILE)) {
    fs.writeFileSync(STARRED_FILE, JSON.stringify([]));
}

/* =============================
   MIDDLEWARE
============================= */

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

/* =============================
   STORAGE
============================= */

function loadStarred() {
    try {
        return JSON.parse(fs.readFileSync(STARRED_FILE));
    } catch {
        return [];
    }
}

function saveStarred(data) {
    fs.writeFileSync(STARRED_FILE, JSON.stringify(data, null, 2));
}

let starredTopics = loadStarred();

/* =============================
   WIKIPEDIA API
============================= */

async function fetchWikipediaSummary(topic) {
    try {
        const response = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
            {
                headers: {
                    "User-Agent": "QuickLearnApp/1.0"
                }
            }
        );

        if (!response.data?.extract) return null;

        return response.data;

    } catch {
        return null;
    }
}

/* Deep Dive */

async function fetchFocusedDeepDive(topic) {
    try {

        const response = await axios.get(
            "https://en.wikipedia.org/w/api.php",
            {
                params: {
                    action: "parse",
                    page: topic,
                    format: "json",
                    prop: "text",
                    sections: 1
                },
                headers: {
                    "User-Agent": "QuickLearnApp/1.0"
                }
            }
        );

        return response.data?.parse?.text?.["*"] || null;

    } catch (err) {
        console.log("Deep dive fetch error:", err.message);
        return null;
    }
}

/* YouTube Videos */

async function fetchRelatedVideos(topic) {
    try {
        const response = await axios.get(
            "https://www.googleapis.com/youtube/v3/search",
            {
                params: {
                    part: "snippet",
                    q: "all about " + topic,
                    type: "video",
                    maxResults: 5,
                    key: "AIzaSyBmk7O1uCMfF4C0_w3czFExTO2fshnUQII"
                }
            }
        );

        return response.data.items || [];

    } catch {
        return [];
    }
}

/* =============================
   QUIZ ENGINE
============================= */
//clean summary text for quiz questions
function cleanSummary(summary, topic) {

    if (!summary) return "";

    const regex = new RegExp(topic, "gi");

    return summary
        .replace(regex, "")
        .replace(/\s+/g, " ")
        .trim();
}

let quizSession = null;

function generateChoices(topic, allTopics) {

    const wrong = allTopics
        .filter(t => t !== topic)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

    return [...wrong, topic].sort(() => Math.random() - 0.5);
}

async function createQuizSession(topics) {

    const shuffled = [...topics].sort(() => Math.random() - 0.5);

    const questions = [];

    for (let topic of shuffled.slice(0, 3)) {

        const summaryData = await fetchWikipediaSummary(topic);

        if (!summaryData?.extract) continue;

        const cleanText = cleanSummary(
            summaryData.extract,
            topic
        );

        questions.push({
            topic,
            question: `Explain this concept: ${cleanText.slice(0, 120)}...`,
            choices: generateChoices(topic, topics),
            answer: topic
        });
    }

    return {
        questions,
        currentIndex: 0,
        score: 0
    };
}
/* =============================
   ROUTES
============================= */

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/topic", async (req, res) => {

    const topic = req.query.topic;
    const mode = req.query.mode || "summary";

    if (!topic) return res.redirect("/");

    const topicData = await fetchWikipediaSummary(topic.trim());

    if (!topicData) {
        return res.render("index", {
            error: "Topic not found"
        });
    }

    let deepContent = null;
    let videos = [];

    if (mode === "deep") {
        deepContent = await fetchFocusedDeepDive(topicData.title);
    }

    if (req.query.videos === "true") {
        videos = await fetchRelatedVideos(topicData.title);
    }

    res.render("topic", {
        topicData,
        mode,
        deepContent,
        starredTopics,
        videos
    });
});

/* Save System */

app.post("/star", (req, res) => {

    const topic = req.body.topic;

    if (topic && !starredTopics.includes(topic)) {
        starredTopics.push(topic);
        saveStarred(starredTopics);
    }

    res.redirect("/saved");
});

app.post("/unsave", (req, res) => {

    const topic = req.body.topic;

    starredTopics = starredTopics.filter(t => t !== topic);
    saveStarred(starredTopics);

    res.redirect("/saved");
});

app.get("/saved", (req, res) => {
    starredTopics = loadStarred();
    res.render("saved", { starredTopics });
});

/* Quiz System */

app.get("/quiz/start", async (req, res) => {

    starredTopics = loadStarred();

    if (!starredTopics.length) {
        return res.send("No saved topics.");
    }

    quizSession = await createQuizSession(starredTopics);

    res.redirect("/quiz/play");
});

app.get("/quiz/play", (req, res) => {

    if (!quizSession) return res.redirect("/quiz/start");

    const q = quizSession.questions[quizSession.currentIndex];

    res.render("quiz", {
        question: q,
        score: quizSession.score,
        total: quizSession.questions.length
    });
});

app.post("/quiz/answer", (req, res) => {

    if (!quizSession) return res.redirect("/quiz/start");

    const answer = req.body.answer;

    const current =
        quizSession.questions[quizSession.currentIndex];

    if (answer === current.answer) quizSession.score++;

    quizSession.currentIndex++;

    if (quizSession.currentIndex >= quizSession.questions.length) {
        return res.redirect("/quiz/result");
    }

    res.redirect("/quiz/play");
});

app.get("/quiz/result", (req, res) => {

    if (!quizSession) return res.redirect("/quiz/start");

    const score = quizSession.score;
    const total = quizSession.questions.length;

    quizSession = null;

    res.render("quiz-result", { score, total });
});

/* ============================= */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});