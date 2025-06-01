// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "export") return true;

  // Merged items query and map into a single chain
  const products = Array.from(
    document.querySelectorAll('div.s-main-slot [data-component-type="s-search-result"]')
  )
  .map(el => {
    const title = el.querySelector("h2 span")?.textContent.trim() || "";

    // limpiamos prefijo de patrocinado
    const img    = el.querySelector("img.s-image");
    // Removed sponsored prefix from alt text
    const rawAlt = (img?.alt || "")
      .replace(/^Anuncio patrocinado:\s*/i, "")
      .trim();
    const description = rawAlt.startsWith(title) && rawAlt !== title
      ? rawAlt.slice(title.length).trim()
      : "No aplica";

  const ratingEl = el.querySelector("i span.a-icon-alt");
  let rating     = ratingEl
    ? ratingEl.textContent.trim().split(" ")[0]
    : "0";
  // Convert decimal comma to dot for consistent parsing later
  rating = rating.replace(',', '.');

    const revSpan = el.querySelector('a[href*="#customerReviews"] span');
    const reviews = revSpan
      ? revSpan.textContent.replace(/[^\d]/g, "")
      : "0";

    const priceEl = el.querySelector("span.a-price span.a-offscreen");
    const price   = priceEl
      ? priceEl.textContent.replace(/[^0-9.,]/g, "")
      : "0";

    return { title, description, rating, reviews, price };
  })
  // opcional: quedarte sólo con los que sí tienen precio real
  //.filter(p => p.price !== "0")
  .filter(p => p.title); // Keep filtering by title

  sendResponse({ products });
  return true; // Keep async response handling
});
