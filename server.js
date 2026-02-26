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
   SUMMARY FETCH
================================ */
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

        if (!response.data || !response.data.extract) return null;

        return response.data;

    } catch {
        return null;
    }
}

/* ===============================
   FOCUSED DEEP DIVE EXTRACTION
================================ */
async function fetchFocusedDeepDive(topic) {
    try {
        // Step 1: Get page sections
        const sectionResponse = await axios.get(
            "https://en.wikipedia.org/w/api.php",
            {
                params: {
                    action: "parse",
                    page: topic,
                    format: "json",
                    prop: "sections",
                    redirects: true
                },
                headers: {
                    "User-Agent": "QuickLearnApp/1.0"
                }
            }
        );

        if (!sectionResponse.data?.parse?.sections) return null;

        const sections = sectionResponse.data.parse.sections;

        // Select first 3 main sections
        const mainSections = sections
            .filter(sec => sec.toclevel === 1)
            .slice(0, 3);

        let deepContent = "";

        // Fetch content of selected sections
        for (const section of mainSections) {
            const contentResponse = await axios.get(
                "https://en.wikipedia.org/w/api.php",
                {
                    params: {
                        action: "parse",
                        page: topic,
                        format: "json",
                        prop: "text",
                        section: section.index
                    },
                    headers: {
                        "User-Agent": "QuickLearnApp/1.0"
                    }
                }
            );

            if (contentResponse.data?.parse?.text) {
                deepContent += contentResponse.data.parse.text["*"];
            }
        }

        return deepContent;

    } catch {
        return null;
    }
}

//fetch related videos
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

    } catch (error) {
        console.log("YouTube API Error:", error.message);
        return [];
    }
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

    if (!topic) return res.redirect("/");

    topic = topic.trim();

    const topicData = await fetchWikipediaSummary(topic);

    if (!topicData) {
        return res.render("index", {
            error: "Topic not found"
        });
    }

    let deepContent = null;
    let flashcards = [];

    if (mode === "deep") {
        deepContent = await fetchFocusedDeepDive(topicData.title);
    }

    let videos = [];

    if (req.query.videos === "true") {
        videos = await fetchRelatedVideos(topicData.title);
    }


    res.render("topic", {
        topicData,
        mode,
        deepContent,
        flashcards,
        starredTopics,
        videos
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

//fetch related videos


app.post("/unsave", (req, res) => {
    const topic = req.body.topic;

    starredTopics = starredTopics.filter(t => t !== topic);

    res.redirect("/saved");
});
/* ===============================
   SAVED PAGE
================================ */
app.get("/saved", (req, res) => {
    res.render("saved", { starredTopics });
});



app.get("/test-dictionary", async (req, res) => {
    const result = await fetchUniversalDefinition("india");
    res.send(result || "No definition returned");
});
/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});