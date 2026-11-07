import * as cheerio from 'cheerio';
import { imageSize } from 'image-size';
import { extractText, getDocumentProxy } from 'unpdf';

export type LinkCandidate = { url: string; text: string };
export type ImageCandidate = { url: string; alt: string; isOgImage: boolean };

export type ExtractedPage = {
  title: string;
  text: string;
  pdfLinks: LinkCandidate[];
  images: ImageCandidate[];
};

function absolute(href: string | undefined, base: string): string | null {
  if (!href || href.startsWith('javascript:') || href.startsWith('data:') || href.startsWith('mailto:')) return null;
  try {
    const u = new URL(href, base);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

const SKIP_IMAGE =
  /(logo|icon|banner|btn|button|arrow|sprite|spacer|bg_|background|loading|blank|sns|twitter|facebook|line|youtube|instagram|sample|no_?image|no-image|placeholder|dummy|\/themes\/)/i;

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const title = $('title').first().text().trim() || $('h1').first().text().trim();

  const pdfLinks = new Map<string, LinkCandidate>();
  $('a[href]').each((_, el) => {
    const url = absolute($(el).attr('href'), pageUrl);
    if (!url || !/\.pdf($|\?)/i.test(url)) return;
    const text = `${$(el).text()} ${$(el).attr('title') ?? ''}`.replace(/\s+/g, ' ').trim();
    const existing = pdfLinks.get(url);
    if (!existing) pdfLinks.set(url, { url, text });
    else if (text && !existing.text.includes(text)) existing.text = `${existing.text} ${text}`.trim();
  });

  const images = new Map<string, ImageCandidate>();
  const og = absolute($('meta[property="og:image"]').attr('content'), pageUrl);
  if (og) images.set(og, { url: og, alt: title, isOgImage: true });
  $('img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src') ?? $(el).attr('data-original');
    const url = absolute(src, pageUrl);
    if (!url || images.has(url) || SKIP_IMAGE.test(url) || /\.svg($|\?)/i.test(url)) return;
    images.set(url, { url, alt: ($(el).attr('alt') ?? '').trim(), isOgImage: false });
  });

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return { title, text, pdfLinks: [...pdfLinks.values()], images: [...images.values()] };
}

export async function extractPdf(data: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text, pageCount: totalPages };
}

export function readImageInfo(data: Uint8Array): { width: number; height: number; type: string } | null {
  try {
    const { width, height, type } = imageSize(data);
    if (!width || !height || !type) return null;
    return { width, height, type };
  } catch {
    return null;
  }
}
