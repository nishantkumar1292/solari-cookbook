#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const COPY_PATH = new URL("../docs/LAUNCH_POST.md", import.meta.url);
const REQUIRED = [
  "@harrychow_",
  "@getsolari",
  "https://nishantkumar1292.github.io/solari-cookbook/",
  "https://github.com/nishantkumar1292/solari-cookbook/tree/main/projects/airlock",
];
const URL_PATTERN = /https?:\/\/\S+/g;

const source = await readFile(COPY_PATH, "utf8");
const thread = section(source, "X thread", "LinkedIn");
const linkedIn = section(source, "LinkedIn");
const posts = [
  ...thread.matchAll(
    /\*\*Post (\d+)\*\*\s*\n([\s\S]*?)(?=\n\*\*Post \d+\*\*|$)/g,
  ),
].map((match) => ({ number: Number(match[1]), text: match[2].trim() }));

if (posts.length !== 4) {
  throw new Error(`Expected four X posts; found ${posts.length}`);
}

for (const post of posts) {
  const length = xWeightedLength(post.text);
  console.log(`X post ${post.number}: ${length}/280 weighted characters`);
  if (length > 280) {
    throw new Error(`X post ${post.number} exceeds the 280-character limit`);
  }
}

const linkedInLength = [...linkedIn].length;
console.log(`LinkedIn: ${linkedInLength}/3000 characters`);
if (linkedInLength > 3_000) {
  throw new Error("LinkedIn copy exceeds the 3,000-character limit");
}

for (const required of REQUIRED) {
  if (!source.includes(required)) {
    throw new Error(`Launch copy is missing required reference: ${required}`);
  }
}

function xWeightedLength(value) {
  const normalized = value.replace(URL_PATTERN, "x".repeat(23));
  return [...normalized].reduce(
    (total, character) => total + (character.codePointAt(0) > 0xffff ? 2 : 1),
    0,
  );
}

function section(value, heading, nextHeading) {
  const start = value.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`Missing “${heading}” section`);
  const bodyStart = value.indexOf("\n", start) + 1;
  const end = nextHeading
    ? value.indexOf(`## ${nextHeading}`, bodyStart)
    : value.length;
  if (nextHeading && end === -1) {
    throw new Error(`Missing “${nextHeading}” section`);
  }
  return value.slice(bodyStart, end).trim();
}
