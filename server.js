const express = require("express");
const axios = require("axios");
const natural = require("natural");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

/*
Wikipedia Client
*/

const axiosInstance = axios.create({
    headers: {
        "User-Agent": "LearningEngine/1.0 (contact: bigman@gmail.com)",
        "Accept": "application/json"
    }
});

/*
Wikipedia Fetch Engine
*/

async function fetchWikipedia(baseTopic, mode) {

    let queryTopic = baseTopic;

    if (mode === "history") {
        queryTopic = baseTopic + " history";
    }

    const searchResponse = await axiosInstance.get(
        "https://en.wikipedia.org/w/api.php",
        {
            params: {
                action: "query",
                list: "search",
                srsearch: queryTopic,
                format: "json"
            }
        }
    );

    const results = searchResponse.data?.query?.search;

    if (!results || results.length === 0) return null;

    const pageTitle = results[0].title;

    const summaryResponse = await axiosInstance.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
    );

    return {
        pageTitle,
        summary: summaryResponse.data?.extract || ""
    };
}

/*
Keyword Extractor
*/

function extractKeywords(text) {

    const tokenizer = new natural.WordTokenizer();
    const words = tokenizer.tokenize((text || "").toLowerCase());

    const stopwords = natural.stopwords;

    const filtered = words.filter(word =>
        !stopwords.includes(word) &&
        word.length > 4 &&
        /^[a-z]+$/.test(word)
    );

    const counts = {};

    filtered.forEach(word => {
        counts[word] = (counts[word] || 0) + 1;
    });

    return Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, 10);
}

/*
Unified Study Route
*/

app.post("/study", async (req, res) => {

    const baseTopic = String(req.body.topic || "").trim();
    const mode = req.body.mode || "summary";

    if (!baseTopic) return res.send("Enter a topic.");

    try {

        const data = await fetchWikipedia(baseTopic, mode);

        if (!data) return res.send("No results found.");

        res.render("topic", {
            topic: data.pageTitle,
            summary: data.summary,
            keywords: extractKeywords(data.summary),
            mode,
            baseTopic
        });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.send("Error fetching topic.");
    }
});

/*
Home Page
*/

app.get("/", (req, res) => {
    res.render("index");
});

/*
Server Start
*/

app.use(express.static("public"));

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});