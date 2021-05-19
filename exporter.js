const {
  readdir,
  readJson,
  ensureDir,
  outputFile,
  createWriteStream,
} = require("fs-extra");
var fs = require("fs");
var path = require("path");
var FormData = require("form-data");
const { join, dirname } = require("path");
const cheerio = require("cheerio");
const axios = require("axios");

// TODO: Use env variables instead
let STRAPI_HOST = "http://127.0.0.1:1337";
let DRUPAL_HOST = "rec.monemprunt.com";
const JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNjIwNzI3MzkzLCJleHAiOjE2MjMzMTkzOTN9.kgyFrBY1UrcOz-UQCZiiMnXWvZI4_Xpp2PQ7BBIVLZM";
const AXIOS_CONFIG = {
  headers: {
    "Content-Type": "application/json",
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
 * @param {{name: string, slug: string}} category
 * @param {{name: string, slug: string}[]} subcategories
 * @return {Promise<{id: number, name: string, children: {id: number}[]}>}
 */
async function GetOrCreateCategory(host, category, subcategories = []) {
  /**
   * @type {Array<{id: number}>} categories
   */
  const { data: categories } = await axios.get(
    `${host}/categories?name=${encodeURIComponent(category.name)}`,
    AXIOS_CONFIG
  );

  /**
   * @type {{id: number}} parent
   */
  let parent;
  /** @type {Array<{id: number}>} children */
  let children = [];
  // if parent exists, set parent
  if (categories.length > 0) {
    parent = {
      id: categories[0].id,
      name: categories[0].name,
      children: categories[0].subcategories.map((child) => child.id),
    };
  } else {
    // else create a new category
    const {
      data: { id, children, name },
    } = await axios.post(
      `${host}/categories`,
      {
        name: category.name,
        SEO: {
          title: category.name,
          slug: category.slug,
        },
      },
      AXIOS_CONFIG
    );
    parent = { id, children, name };
  }

  // then get the children
  for (let i = 0; i < subcategories.length; i++) {
    children = [...children, await GetOrCreateCategory(host, subcategories[i])];
  }

  if (children.length > 0 && parent.children.length < subcategories.length) {
    // Attach children to parent
    parent.children = [...children, ...parent.children];
    await axios.put(
      `${host}/categories/${parent.id}`,
      {
        subcategories: parent.children,
      },
      AXIOS_CONFIG
    );
  }

  return parent;
}

/**
 * @param {string} host
 * @param {string} dataFolder
 * @param {{name: string, avatar: {path: string, name: string}}} author
 * @return {Promise<{id: number}>}
 */
async function GetOrCreateAuthor(host, dataFolder, author) {
  // Get user
  /**
   * @type {{id: number, image: {id: number}}} user
   */
  let user;

  const { data: users } = await axios.get(
    `${host}/auteurs?name=${encodeURIComponent(author.name)}`,
    AXIOS_CONFIG
  );

  // If user exists then set him
  if (users.length > 0) {
    user = { id: users[0].id, avatar: users[0].image };
  } else {
    // else create a new user
    const {
      data: { id, image },
    } = await axios.post(
      `${host}/auteurs`,
      {
        name: author.name,
      },
      AXIOS_CONFIG
    );
    user = { id, image };
  }

  // if avatar is not the same as the one saved, then upload it
  if (user.avatar == null || user.avatar.name != author.avatar.name) {
    const { id, name } = await GetOrUploadImage(
      host,
      dataFolder,
      author.avatar.path,
      author.avatar.name
    );

    user.avatar = { id, name };
    // update avatar for user
    await axios.put(
      `${host}/auteurs/${user.id}`,
      {
        image: { id },
      },
      AXIOS_CONFIG
    );
  }
  return user;
}

/**
 * @param {string} host
 * @param {string} dataFolder
 * @param {string} path
 * @param {string} fileName
 * @return {Promise<{id: number, name: string, url: string}>}
 */
async function GetOrUploadImage(host, dataFolder, path, fileName) {
  /** @type {id: number, name: string} media */
  let media;
  const { data: medias } = await axios.get(
    `${host}/upload/search/${encodeURIComponent(fileName)}`,
    AXIOS_CONFIG
  );

  // if media exist then set it
  if (medias.length > 0) {
    media = { id: medias[0].id, name: medias[0].name, url: medias[0].url };
  } else {
    // else upload a new media
    let fullPath = `${dataFolder}/${path}`;

    // create form
    let fileStream = fs.createReadStream(fullPath);
    let formData = new FormData();
    formData.append("files", fileStream);

    // upload
    let {
      data: [{ id, name, url }],
    } = await axios.post(`${host}/upload`, formData, {
      headers: {
        ...AXIOS_CONFIG.headers,
        ...formData.getHeaders(),
      },
    });
    media = { id, name, url };
  }

  return media;
}

/**
 * @param {string} host
 * @param {string} dataFolder
 * @param {string} body
 * @return {Promise<string>}
 */
async function ProcessBody(host, dataFolder, body) {
  const $ = cheerio.load(body || "");

  for (let i = 0; i < $("img").length; i++) {
    const element = $("img")[i];

    let path = $(element).attr("src");

    let url = new URL(path, `https://${DRUPAL_HOST}`);

    if (url.host == DRUPAL_HOST) {
      let fn = path.split("/")[path.split("/").length - 1];
      let media = await GetOrUploadImage(host, dataFolder, path, fn);
      $(element).attr("src", `${STRAPI_HOST}${media.url}`);
    }
  }

  return $.html();
}

/**
 * @param {string} file
 * @param {string} dataFolder
 *
 */
async function exportSingleArticle(dataFolder, file) {
  /**
   * @type {{
   *    title: string,
   *    cover: {path: string, name: string},
   *    author: {
   *      name: string,
   *      avatar: {path: string, name: string}
   *    },
   *    published: string,
   *    date: string,
   *    body: string,
   *    link: string,
   *    slug: string,
   *    category: {name: string, slug: string},
   *    subcategories: Array<{name: string, slug: string}>
   * }} node
   */
  const node = await readJson(file);
  let host = process.argv[3] || STRAPI_HOST;

  const category = await GetOrCreateCategory(
    host,
    node.category,
    node.subcategories
  );
  const author = await GetOrCreateAuthor(host, dataFolder, node.author);
  /** @type {{id: number}} cover */
  let cover;
  if (node.cover && node.cover.path && node.cover.name) {
    cover = await GetOrUploadImage(
      host,
      dataFolder,
      node.cover.path,
      node.cover.name
    );
  }
  const body = await ProcessBody(host, dataFolder, node.body);

  // return;
  const { slug, title, date: published_date, summary } = node;

  // push to server
  const { data: articles } = await axios.get(
    `${host}/articles?title=${encodeURIComponent(title)}`,
    AXIOS_CONFIG
  );

  let article = articles[0];
  // if article exists update section if different
  if (articles.length > 0) {
    // do nothing
    console.log("\x1b[37mFound => \x1b[32m", article.title);

    if (article.section == null || article.section.name != category.name) {
      await axios.put(
        `${host}/articles/${articles[0].id}`,
        {
          section: { id: category.id },
          body,
        },
        AXIOS_CONFIG
      );
    }
  } else {
    const { data } = await axios.post(
      `${host}/articles`,
      {
        title,
        body,
        published_date,
        summary,
        SEO: {
          title,
          slug,
          description: summary,
        },
        cover: cover ? { id: cover.id } : null,
        author: { id: author.id },
        section: { id: category.id },
      },
      AXIOS_CONFIG
    );

    console.log("\x1b[37mCreated => \x1b[34m", data.title);
  }

  // process.exit(0);
  return;
}

/**
 * @param {string} dataFolder
 * @param {string} host
 */
async function exportAllArticles(dataFolder) {
  let dataFiles = [];
  const articleFolders = ["guide-immo", "marche-immobilier", "actualites"];
  let processed = 0;
  let all = [];

  for (let i = 0; i < articleFolders.length; i++) {
    const folder = articleFolders[i];
    walk(`${dataFolder}/${folder}`, (err, results) => {
      if (err) throw err;
      dataFiles = [...dataFiles, ...results];
      processed++;

      // if all folders have been processed
      if (processed == articleFolders.length) {
        dataFiles.reduce(
          (p, node) => p.then((_) => exportSingleArticle(dataFolder, node)),
          Promise.resolve({})
        );
        // for (let i = 0; i < dataFiles; i++) {
        //   const node = dataFiles[i];
        //   all = [...all, exportSingleArticle(dataFolder, node)];
        // }
      }
    });
  }
}

exportAllArticles(process.argv[2]);
