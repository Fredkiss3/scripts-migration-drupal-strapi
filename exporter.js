const {
  readdir,
  readJson,
  ensureDir,
  outputFile,
  createWriteStream,
} = require("fs-extra");
var fs = require("fs");
var path = require("path");
const { join, dirname } = require("path");
const cheerio = require("cheerio");
const axios = require("axios");

// TODO: Use env variables instead
let STRAPI_HOST = "http://127.0.0.1:1337";
const articleFolders = ["guide-immo", "marche-immobilier", "actualites"];
const JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNjIwNzI3MzkzLCJleHAiOjE2MjMzMTkzOTN9.kgyFrBY1UrcOz-UQCZiiMnXWvZI4_Xpp2PQ7BBIVLZM";
const AXIOS_CONFIG = {
  "Content-Type": "application/json",
  headers: {
    Authorization: `Bearer ${JWT_TOKEN}`,
  },
};

/**
 * @param {string} dir
 * @param {(err, results: string[]) => void} done
 */
const walk = (dir, done) => {
  let results = [];
  fs.readdir(dir, function (err, list) {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function (file) {
      file = path.resolve(dir, file);
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

/**
 * @param {string} host
 * @param {string} slug
 * @return {Promise<{id: number}>} category
 */
async function GetOrCreateCategory(host, slug) {
  /**
   * @type {Array<{id: number}>} categories
   */
  const { data: categories } = await axios.get(
    `${host}/categories?slug=${slug}`,
    AXIOS_CONFIG
  );

  if (categories.length > 0) {
    return categories[0];
  } else {
    try {
      const {
        data: [category],
      } = await axios.post(
        `${host}/categories`,
        { slug: slug, name: "" },
        AXIOS_CONFIG
      );
      return category;
    } catch (error) {
      try {
        const {
          data: [category],
        } = await axios.get(`${host}/categories?slug=${slug}`, AXIOS_CONFIG);
        return category;
      } catch (error) {
        throw error;
        process.exit(0);
      }
    }
  }
}

/**
 * @param {string} host
 * @param {string} slug
 * @return {Promise<{id: number}>}
 */
async function GetOrCreateAuthor(host, name) {}

/**
 * @param {string} host
 * @param {string} dataFolder
 * @param {string} path
 * @return {Promise<{id: number, url: string}>}
 */
async function GetAndUploadCoverImage(host, dataFolder, path) {}

/**
 * @param {string} host
 * @param {string} dataFolder
 * @param {string} body
 * @return {Promise<string>}
 */
async function ProcessBody(host, dataFolder, body) {}

/**
 * @param {string} file
 *
 */
async function exportSingleArticle(dataFolder, file) {
  /**
   * @type {{title: string, cover: string, author: string, published: string, date: string, body: string,link: string}} node
   */
  const node = await readJson(file);
  let host = process.argv[3] || STRAPI_HOST;

  const [categorySlug, slug] = node.link.split("/").slice(-2);

  const category = await GetOrCreateCategory(host, categorySlug);
  console.log(category);
  process.exit(0);
  const author = await GetOrCreateAuthor(host, node.author);
  const image = await GetAndUploadCoverImage(host, dataFolder, node.cover);
  const body = await ProcessBody(host, dataFolder, node.body);
  const { title, date: published_date } = node;

  // push to server
  const res = await axios.post(`${host}/articles`, {
    title,
    body,
    published_date,
    slug,
    image,
    author,
    category,
  });

  console.log(res.data);

  process.exit(0);
  return null;
}

/**
 * @param {string} dataFolder
 * @param {string} host
 */
async function exportAllArticles(dataFolder) {
  let dataFiles = [];
  articleFolders.forEach((folder) =>
    walk(`${dataFolder}/${folder}`, (err, results) => {
      if (err) throw err;
      dataFiles = [
        ...dataFiles,
        ...[...results].map((node) => exportSingleArticle(dataFolder, node)),
      ];
    })
  );
}

exportAllArticles(process.argv[2]);
