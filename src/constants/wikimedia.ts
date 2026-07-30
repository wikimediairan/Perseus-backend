export const WIKIPEDIA_DOMAIN = "en.wikipedia.org";
export const SOURCE_WIKI_CODE = "enwiki" as const;

export const WIKIMEDIA_API_USER_AGENT =
	"Perseus Wikimedia Provider/0.1.0 (https://github.com/wikimediairan/Perseus-backend; alireza3205@gmail.com)";

export const WIKIMEDIA_REQUEST_HEADERS = {
	"User-Agent": WIKIMEDIA_API_USER_AGENT,
	Accept: "text/html",
} as const;
