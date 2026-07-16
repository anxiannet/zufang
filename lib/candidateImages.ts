import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

const image_attributes = [
  "data-src",
  "data-original",
  "data-original-src",
  "data-lazy-src",
  "data-lazyload",
  "data-url",
  "src"
] as const;

const detail_root_selectors = [
  "article > main",
  ".node-content",
  ".post-content",
  ".field-name-body",
  ".content .body",
  "article",
  "main",
  "body"
];

const noisy_image_section_pattern = /^(?:相关广告|相关推荐|相关房源|类似房源|热门房源|最新房源|推荐房源|猜你喜欢|更多房源|附近房源|评论)(?:\s|$)/i;

export type CandidateImage = {
  image_url: string;
  sort_order: number;
  caption: null;
};

export function extract_candidate_images(input: {
  detail_html: string | null | undefined;
  list_html: string | null | undefined;
  page_url: string | null | undefined;
}): CandidateImage[] {
  const urls = new Set<string>();

  // Prefer the latest list thumbnail. Source posts can replace their gallery,
  // leaving older detail snapshots pointing at deleted or placeholder images.
  collect_images(urls, input.list_html, input.page_url);
  collect_detail_images(urls, input.detail_html, input.page_url);

  return [...urls].slice(0, 6).map((image_url, sort_order) => ({
    image_url,
    sort_order,
    caption: null
  }));
}

function collect_detail_images(
  urls: Set<string>,
  html: string | null | undefined,
  page_url: string | null | undefined
): void {
  if (!html) return;

  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form, aside, iframe").remove();

  $("h1, h2, h3, h4, h5, h6").each((_, element) => {
    const heading = $(element);
    const heading_text = heading.text().replace(/\s+/g, " ").trim();
    if (!noisy_image_section_pattern.test(heading_text)) return;
    heading.closest("section, div, ul, ol").remove();
  });

  const detail_root = detail_root_selectors
    .map((selector) => $(selector).first())
    .find((node) => node.length > 0);

  if (detail_root) collect_image_nodes($, urls, detail_root.find("img"), page_url);
}

function collect_images(
  urls: Set<string>,
  html: string | null | undefined,
  page_url: string | null | undefined
): void {
  if (!html) return;
  const $ = cheerio.load(html);
  collect_image_nodes($, urls, $("img"), page_url);
}

function collect_image_nodes(
  $: cheerio.CheerioAPI,
  urls: Set<string>,
  nodes: cheerio.Cheerio<AnyNode>,
  page_url: string | null | undefined
): void {
  nodes.each((_, element) => {
    const node = $(element);
    const candidates = [
      ...image_attributes.map((attribute) => node.attr(attribute)),
      ...srcset_urls_by_quality(node.attr("srcset"))
    ];

    for (const value of candidates) {
      const image_url = normalize_candidate_image_url(value, page_url);
      if (image_url) urls.add(image_url);
    }
  });
}

export function normalize_candidate_image_url(
  value: string | undefined,
  page_url: string | null | undefined
): string | null {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;

  try {
    const url = new URL(value, page_url || undefined);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (/(?:^|\/)imgdef(?:\/|$)/i.test(url.pathname)) return null;
    if (/(?:logo|avatar|icon|emoji|loading|placeholder|qrcode|qr-code|sprite)/i.test(url.pathname)) return null;

    const shicheng_thumbnail = url.hostname === "www.shichengbbs.com"
      ? url.pathname.match(/^\/img\/app\.models\.Image\/(\d+)\/(\d+)x(\d+)\/\d+\.(avif|webp|jpe?g|png)$/i)
      : null;
    if (shicheng_thumbnail && (Number(shicheng_thumbnail[2]) <= 320 || Number(shicheng_thumbnail[3]) <= 240)) {
      const [, image_id, , , extension] = shicheng_thumbnail;
      const version = url.searchParams.get("v");
      url.pathname = `/images/image/${image_id.slice(0, 3)}/${image_id}.${extension.toLowerCase()}`;
      url.search = version ? `?${encodeURIComponent(version)}` : "";
    }

    return url.toString();
  } catch {
    return null;
  }
}

function srcset_urls_by_quality(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => {
      const [url, descriptor = "0"] = entry.trim().split(/\s+/);
      return { url, quality: Number.parseFloat(descriptor) || 0 };
    })
    .filter((entry) => Boolean(entry.url))
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.url);
}
