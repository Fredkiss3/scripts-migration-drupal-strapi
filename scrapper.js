// @ts-check
/**
 * Run in console on the 1st Drupal content page.
 */

/**
 * Fetch an HTML document
 * @param {RequestInfo} input
 * @param {RequestInit} [init]
 */
async function fetchDocument(input, init) {
  const res = await fetch(input, init);
  const text = await res.text();
  return new DOMParser().parseFromString(text, "text/html");
}

/**
 * Get link to next page
 * @param {ParentNode} page
 */
function nextPage(page) {
  const current = page.querySelector(".pager__item.is-active"); // Get the current pagination button element
  if (current.nextElementSibling == null) {
    return null; // Last page.
  }

  return current.nextElementSibling.querySelector("a").href;
}

/**
 * Extract all the event posts from this page
 * @param {ParentNode} page
 */
function* findLinks(page) {
  const rows = page.querySelectorAll(".views-table tbody tr");
  for (const row of rows) {
    const [
      _c, // Ignore first cell (checkbox)
      titleCell,
      typeCell,
      authorCell,
      status,
      updatedCell,
    ] = row.children;
    yield {
      title: titleCell.textContent.trim(),
      link: titleCell.querySelector("a").href.trim(),
      type: typeCell.textContent.trim(),
      published: status.textContent.trim() === "Publié",
      author: {
        username: authorCell.textContent.trim(),
        link: authorCell.querySelector("a").href.trim(),
      },
      date: updatedCell.textContent.trim(),
    };
  }
}

function main() {
  const linkData = JSON.stringify(Array.from(findLinks(document)));
  const file = new Blob([linkData], { type: "text/plain" });
  const url = URL.createObjectURL(file);

  // Make a link element and click it to download the JSON File.
  const download = document.createElement("a");
  download.href = url;
  download.download = `drupal.json`;
  download.dispatchEvent(new MouseEvent("click"));

  URL.revokeObjectURL(url);

  location.assign(nextPage(document));
}

main();
