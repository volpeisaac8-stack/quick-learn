const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

let starredTopics = [];

/* ===============================
   SAFE WIKIPEDIA SUMMARY FETCH
================================ */
async function fetchWikipedia(topic) {
    try {
        const response = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
            {
                headers: {
                    "User-Agent": "QuickLearnApp/1.0"
                }
            }
        );

        // If page exists but has no extract
        if (!response.data.extract) return null;

        return response.data;

    } catch (error) {
        return null;
    }
}

/* ===============================
   SAFE DEEP DIVE FETCH
================================ */
async function fetchDeepDive(topic) {
    try {
        const response = await axios.get(
            "https://en.wikipedia.org/w/api.php",
            {
                params: {
                    action: "parse",
                    page: topic,
                    format: "json",
                    prop: "text",
                    redirects: true
                },
                headers: {
                    "User-Agent": "QuickLearnApp/1.0"
                }
            }
        );

        if (!response.data.parse) return null;

        return response.data.parse.text["*"];

    } catch {
        return null;
    }
}

/* ===============================
   FLASHCARD GENERATOR
================================ */
async function generateFlashcards(topic) {
    const summary = await fetchWikipedia(topic);
    if (!summary) return [];

    return [
        {
            question: `What is ${summary.title}?`,
            answer: summary.extract
        }
    ];
}

/* ===============================
   ROUTES
================================ */

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/topic", async (req, res) => {
    let topic = req.query.topic;
    const mode = req.query.mode || "summary";

    if (!topic || topic.trim() === "") {
        return res.redirect("/");
    }

    topic = topic.trim();

    const topicData = await fetchWikipedia(topic);

    if (!topicData) {
        return res.render("index", {
            error: "Topic not found. Try a different search."
        });
    }

    let deepContent = null;
    let flashcards = [];

    if (mode === "deep") {
        deepContent = await fetchDeepDive(topicData.title);
    }

    if (mode === "flashcards") {
        flashcards = await generateFlashcards(topicData.title);
    }

    res.render("topic", {
        topicData,
        mode,
        deepContent,
        flashcards,
        starredTopics
    });
});

/* ===============================
   STAR TOPIC
================================ */
app.post("/star", (req, res) => {
    const topic = req.body.topic;

    if (topic && !starredTopics.includes(topic)) {
        starredTopics.push(topic);
    }

    res.redirect("/saved");
});

/* ===============================
   SAVED PAGE
================================ */
app.get("/saved", (req, res) => {
    res.render("saved", { starredTopics });
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});