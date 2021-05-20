const {
  readdir,
  readJson,
  ensureDir,
  outputFile,
  createWriteStream,
} = require("fs-extra");
const { join, dirname } = require("path");
const cheerio = require("cheerio");
const fetch = require("node-fetch");
const axios = require("axios");

require("dotenv").config({ path: ".env.local" });

const HOST = process.env.DRUPAL_HOST;

/**
 *
 * @param {cheerio.Cheerio<cheerio.Element>} html
 * @param {string} outFolder
 * @returns {Array<Promise<string>>}
 */
function parseHTMLImages(html, outFolder, $) {
  return html
    .find("img")
    .toArray()
    .map((img) => new URL($(img).attr("src"), `https://${HOST}`))
    .filter((url) => url.host === `${HOST}`)
    .map(async (url) => {
      return downloadImage(url, outFolder);
    });
}

/**
 *
 * @param {URL} url
 * @param {string} outFolder
 * @returns {Promise<string>}
 */
async function downloadImage(url, outFolder) {
  if (url) {
    const imagePath = join(outFolder, url.pathname);
    const [res] = await Promise.all([
      fetch(url),
      ensureDir(dirname(imagePath)),
    ]);

    const dest = createWriteStream(imagePath, "binary");
    res.body.pipe(dest);
    await new Promise((resolve, reject) => {
      dest.once("finish", resolve);
      dest.once("error", reject);
    });
  }
  return url;
}

/**
 * @param {object} node
 * @param {string} node.title
 * @param {string} node.link
 * @param {string} node.type
 * @param {object} node.author
 * @param {string} node.author.username
 * @param {string} node.author.link
 * @param {boolean} node.published
 * @param {string} node.date
 * @param {string} outFolder
 */
async function scrapePage(node, outFolder) {
  // dont upload unpublished articles
  if (!node.published) return;

  const url = new URL(`${node.link}?_format=hal_json`);
  let resJSON;
  let pageBody;
  let categoryPageBody;
  let urlC;
  let categorySlug;

  try {
    resJSON = await axios.get(url.toString());
    let resHTML = await fetch(new URL(`${node.link}`).toString());

    let arr = node.link.split("/");
    urlC = arr.slice(3, arr.length - 1).join("/");
    categorySlug = arr[arr.length - 2];
    let rescategoryHTML = await fetch(
      new URL(`/pages/${urlC}`, `https://${HOST}`).toString()
    );

    // get the HTML content of the article page
    pageBody = await resHTML.text();

    // get the HTML content of the category page
    categoryPageBody = await rescategoryHTML.text();
  } catch (error) {
    return;
  }

  /**
   * @type {Array<{value: string, summary: string}>} body
   */
  const body = resJSON.data.body;

  /**
   * @type {Array<{href: string}>} coverUrl
   */
  let imagePath =
    resJSON.data._links[
      `http://rec.monemprunt.com/rest/relation/node/${resJSON.data.type[0].target_id}/field_image`
    ];

  let coverUrl = imagePath ? new URL(imagePath[0].href) : null;

  const value = body ? body[0]?.value : "";
  const summary = body ? body[0]?.summary : "";

  const $ = cheerio.load(value || "");
  const $$ = cheerio.load(pageBody || "");
  const $c = cheerio.load(categoryPageBody || "");

  const article = $(":root");
  const avatarNode = $$(".node-avatar");
  const category = $c("h1").text();
  const subcategoriesNodes = $c(".menupages ul");

  let subcategories = subcategoriesNodes
    .find("li")
    .toArray()
    .map((li) => {
      let name = $c(li).text().trim();
      let arr = $c(li).find("a").attr("href").split("/");
      let slug = arr[arr.length - 1];

      return {
        name,
        slug,
      };
    });

  const html = article.html() || "";
  let imageDownloads = parseHTMLImages(article, outFolder, $);
  let avatarUrl = await Promise.all(parseHTMLImages(avatarNode, outFolder, $$));

  imageDownloads = [...imageDownloads, downloadImage(coverUrl, outFolder)];

  let link = resJSON.data.path ? resJSON.data.path[0]?.alias : null;
  let coverPath = coverUrl?.pathname;
  let coverFile = coverPath
    ? coverPath.split("/")[coverPath.split("/").length - 1]
    : null;

  let avatarPath = avatarUrl[0]?.pathname;
  let avatarFile = avatarPath
    ? avatarPath.split("/")[avatarPath.split("/").length - 1]
    : null;

  const saveHtml = outputFile(
    join(outFolder, `${url.pathname}.json`),
    JSON.stringify({
      title: node.title,
      cover: { path: coverPath, name: coverFile },
      category: {
        name: category,
        slug: categorySlug,
      },
      subcategories,
      link,
      slug: link && link.split("/")[link.split("/").length - 1],
      author: {
        name: node.author.username,
        avatar: { path: avatarPath, name: avatarFile },
      },
      published: node.published,
      date: getDate(node.date),
      body: html,
      summary,
    })
  );

  const [_b, urls] = await Promise.all([saveHtml, Promise.all(imageDownloads)]);

  urls.push(url);

  return urls;
}

/**
 * @param {string} dataFolder
 * @param {string} outFolder
 * */
async function scrapeAll(dataFolder, outFolder) {
  const dataFiles = await readdir(dataFolder);

  await Promise.all(
    // Iterate through list of JSON files
    dataFiles.map(async (file) => {
      const filePath = join(dataFolder, file);

      /**
       * Read file as json
       * @type { Array<{
       *          title: string,
       *          link: string,
       *          type: string,
       *          published: boolean,
       *          date: string,
       *          author: {username: string, link: string}
       *  }>} json
       * */
      const json = await readJson(filePath);
      // Iterate through objects in the JSON array
      return Promise.all(json.map((node) => scrapePage(node, outFolder)));
    })
  );
}

/**
 *
 * @param {string} date
 * @returns {Date}
 */
function getDate(date) {
  // Dates in Drupal follow the format DD/MM/YYYY - HH:MM
  const DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2})$/;
  const [_, day, month, year, hour, min] = DATE_REGEX.exec(date);
  return new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
}

scrapeAll(process.argv[2], process.argv[3], HOST);
