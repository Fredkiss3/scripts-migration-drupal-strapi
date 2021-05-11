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

let HOST = "rec.monemprunt.com";

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
  // console.log(`${node.title} => ${node.published}`);
  if (!node.published) return;

  const url = new URL(`${node.link}?_format=hal_json`);
  let res;
  try {
    res = await axios.get(url.toString());
  } catch (error) {
    return;
  }

  /**
   * @type {Array<{value: string, summary: string}>} body
   */
  const body = res.data.body;

  /**
   * @type {Array<{href: string}>} coverUrl
   */
  let imagePath =
    res.data._links[
      `http://rec.monemprunt.com/rest/relation/node/${res.data.type[0].target_id}/field_image`
    ];

  let coverUrl = imagePath ? new URL(imagePath[0].href) : null;

  const value = body ? body[0]?.value : "";
  const summary = body ? body[1]?.summary : "";

  const $ = cheerio.load(value || "");
  const article = $(":root");

  const html = article.html() || "";
  let imageDownloads = article
    .find("img")
    .toArray()
    .map((img) => new URL($(img).attr("src"), `https://${HOST}`))
    .filter((url) => url.host === `${HOST}`)
    .map(async (url) => {
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
      return url;
    });

  imageDownloads = [
    ...imageDownloads,
    (async (url) => {
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
    })(coverUrl),
  ];

  const saveHtml = outputFile(
    join(outFolder, `${url.pathname}.json`),
    JSON.stringify({
      title: node.title,
      cover: coverUrl?.pathname,
      link: res.data.path ? res.data.path[0]?.alias : null,
      author: node.author.username,
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
async function scrapeAll(dataFolder, outFolder, host) {
  const dataFiles = await readdir(dataFolder);

  HOST = host;

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

scrapeAll(process.argv[2], process.argv[3], process.argv[4] || HOST);
