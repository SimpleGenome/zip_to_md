import React from 'react';
import './App.css';

const { useEffect, useMemo, useRef, useState } = React;

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "pdf",
  "zip",
  "gz",
  "tar",
  "rar",
  "7z",
  "exe",
  "dll",
  "so",
  "dylib",
  "class",
  "jar",
  "war",
  "pyc",
  "pyo",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "mov",
  "avi",
  "webm",
  "sqlite",
  "db",
  "lockb",
  "bin",
  "psd",
  "ai",
  "sketch",
]);

const DEFAULT_IGNORED_DIRECTORIES = [
  "node_modules",
  "npm_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  "target",
  ".turbo",
  ".cache",
];

const EXTENSION_TO_LANGUAGE = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  php: "php",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  go: "go",
  rs: "rust",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  md: "markdown",
  sql: "sql",
  dockerfile: "dockerfile",
  env: "bash",
  txt: "text",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  gql: "graphql",
};

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function parseIgnoredDirectoryNames(input) {
  return new Set(
    String(input || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function shouldSkipPath(path, ignoredDirectoryNames = new Set()) {
  const normalized = normalizePath(path);
  if (!normalized || normalized.startsWith("__MACOSX/") || normalized === ".DS_Store" || normalized.endsWith("/.DS_Store")) {
    return true;
  }

  const parts = normalized.split("/").map((part) => part.toLowerCase());
  return parts.some((part) => ignoredDirectoryNames.has(part));
}

function getBaseName(filename) {
  return String(filename || "repo").replace(/\.zip$/i, "") || "repo";
}

function sanitizeRepoName(name) {
  return (
    String(name || "repo")
      .replace(/\.zip$/i, "")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "repo"
  );
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildDownloadName(repoName, date = new Date()) {
  return `${formatTimestamp(date)}-${sanitizeRepoName(repoName)}.md`;
}

function getExtension(path) {
  const name = String(path || "").split("/").pop() || "";
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  const parts = name.split(".");
  return parts.length > 1 ? String(parts.pop() || "").toLowerCase() : "";
}

function getLanguage(path) {
  return EXTENSION_TO_LANGUAGE[getExtension(path)] || "text";
}

function hashString(value) {
  let hash = 0;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function anchorId(path) {
  const slug = String(path || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `file-${slug || "item"}-${hashString(path)}`;
}

function getFence(content) {
  const matches = String(content || "").match(/`+/g) || [];
  const longest = matches.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function isLikelyText(path, bytes) {
  const ext = getExtension(path);
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (!bytes || typeof bytes.length !== "number") return true;

  const sampleSize = Math.min(bytes.length, 8000);
  let suspicious = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    const byte = bytes[i];
    if (byte === 0) return false;
    const isControl =
      (byte >= 1 && byte <= 8) ||
      byte === 11 ||
      byte === 12 ||
      (byte >= 14 && byte <= 31);
    if (isControl) suspicious += 1;
  }

  return sampleSize === 0 || suspicious / sampleSize < 0.08;
}

function decodeText(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r\n/g, "\n");
}

function stripCommonRoot(paths) {
  if (!paths.length) {
    return { rootPrefix: "", displayPaths: [] };
  }

  const firstSegments = new Set(paths.map((path) => path.split("/")[0]));
  const hasRootLevelFile = paths.some((path) => !path.includes("/"));

  if (firstSegments.size === 1 && !hasRootLevelFile) {
    const [rootPrefix] = [...firstSegments];
    return {
      rootPrefix,
      displayPaths: paths.map((path) => path.slice(rootPrefix.length + 1)),
    };
  }

  return {
    rootPrefix: "",
    displayPaths: [...paths],
  };
}

function createNode(name, path, type) {
  return {
    name,
    path,
    type,
    children: type === "dir" ? new Map() : undefined,
  };
}

function buildTree(paths) {
  const root = createNode("", "", "dir");

  paths.forEach((path) => {
    const normalized = normalizePath(path);
    if (!normalized) return;

    const parts = normalized.split("/");
    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      const nodeType = isFile ? "file" : "dir";

      if (!current.children.has(part)) {
        current.children.set(part, createNode(part, currentPath, nodeType));
      }

      current = current.children.get(part);
    });
  });

  function sortNode(node) {
    if (node.type === "file") return { ...node };

    const children = [...node.children.values()]
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      })
      .map(sortNode);

    return { ...node, children };
  }

  return sortNode(root);
}

function collectFilesInTreeOrder(node, acc = []) {
  if (node.type === "file") {
    acc.push(node.path);
    return acc;
  }

  node.children.forEach((child) => collectFilesInTreeOrder(child, acc));
  return acc;
}

function renderTreeMarkdown(node, depth = 0) {
  if (node.type === "file") {
    return [`${"  ".repeat(depth)}- [${node.name}](#${anchorId(node.path)})`];
  }

  const lines = [];
  const childDepth = node.path ? depth + 1 : depth;

  if (node.path) {
    lines.push(`${"  ".repeat(depth)}- ${node.name}/`);
  }

  node.children.forEach((child) => {
    lines.push(...renderTreeMarkdown(child, childDepth));
  });

  return lines;
}

function buildMarkdown({ repoName, tree, files, binaryCount, sourceKind, ignoredCount, ignoredDirectoryNames }) {
  const lines = [];
  const ignoredList = Array.from(ignoredDirectoryNames);

  lines.push(`# ${repoName} Repository Export`);
  lines.push("");
  lines.push(
    sourceKind === "folder"
      ? "Generated from a local folder selection on the client side."
      : "Generated from a ZIP upload on the client side."
  );
  lines.push("");
  lines.push(`Total files: **${files.length}**`);
  lines.push("");

  if (ignoredCount > 0) {
    lines.push(`Ignored by folder rules: **${ignoredCount}** file(s) from directories such as ${ignoredList.join(", ")}.`);
    lines.push("");
  }

  if (binaryCount > 0) {
    lines.push(`Note: **${binaryCount}** binary/non-text file(s) are listed in the tree and included below as placeholders instead of raw bytes.`);
    lines.push("");
  }

  lines.push("## 1. File Tree");
  lines.push("");
  lines.push(...renderTreeMarkdown(tree));
  lines.push("");
  lines.push("## 2. File Contents");
  lines.push("");

  files.forEach((file, index) => {
    lines.push(`<a id=\"${anchorId(file.path)}\"></a>`);
    lines.push(`### ${index + 1}. \`${file.path}\``);
    lines.push("");

    if (file.isText) {
      const fence = getFence(file.content);
      lines.push(`${fence}${getLanguage(file.path)}`);
      lines.push(file.content);
      lines.push(fence);
    } else {
      lines.push("```text");
      lines.push("[Binary or non-text file omitted from inline output]");
      lines.push("```");
    }

    lines.push("");
  });

  return lines.join("\n");
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src=\"${src}\"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;

  const sources = [
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
  ];

  let lastError = null;
  for (const src of sources) {
    try {
      await loadScript(src);
      if (window.JSZip) return window.JSZip;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load JSZip.");
}

function prepareDisplayEntries(rawEntries, fallbackRepoName, ignoredDirectoryNames) {
  const filteredEntries = rawEntries.filter((item) => !shouldSkipPath(item.originalPath, ignoredDirectoryNames));

  if (!filteredEntries.length) {
    throw new Error("No files were found after applying the ignore rules.");
  }

  const normalizedPaths = filteredEntries.map((item) => item.originalPath);
  const { rootPrefix, displayPaths } = stripCommonRoot(normalizedPaths);
  const repoName = rootPrefix || getBaseName(fallbackRepoName);

  return {
    repoName,
    ignoredCount: rawEntries.length - filteredEntries.length,
    displayEntries: filteredEntries.map((item, index) => ({
      ...item,
      path: displayPaths[index],
    })),
  };
}

async function readItemBytes(item) {
  if (item.entry) {
    return item.entry.async("uint8array");
  }
  return new Uint8Array(await item.file.arrayBuffer());
}

function runSelfTests() {
  const tests = [];

  function addTest(name, pass, details) {
    tests.push({ name, pass, details: pass ? "OK" : details || "Failed" });
  }

  try {
    const ignoredDirectoryNames = parseIgnoredDirectoryNames(DEFAULT_IGNORED_DIRECTORIES.join(", "));

    addTest("normalizePath converts slashes", normalizePath("./a\\b//c/") === "a/b/c", normalizePath("./a\\b//c/"));
    addTest("parseIgnoredDirectoryNames lowercases values", ignoredDirectoryNames.has("node_modules") && ignoredDirectoryNames.has("npm_modules"), JSON.stringify([...ignoredDirectoryNames]));
    addTest("shouldSkipPath ignores nested node_modules", shouldSkipPath("repo/node_modules/react/index.js", ignoredDirectoryNames) === true, "node_modules should be ignored");
    addTest("shouldSkipPath ignores nested npm_modules", shouldSkipPath("repo/npm_modules/pkg/index.js", ignoredDirectoryNames) === true, "npm_modules should be ignored");
    addTest("shouldSkipPath keeps normal source files", shouldSkipPath("repo/src/index.js", ignoredDirectoryNames) === false, "src/index.js should not be ignored");
    addTest("stripCommonRoot removes single root folder", (() => {
      const result = stripCommonRoot(["repo/src/index.js", "repo/README.md"]);
      return result.rootPrefix === "repo" && result.displayPaths[0] === "src/index.js" && result.displayPaths[1] === "README.md";
    })(), JSON.stringify(stripCommonRoot(["repo/src/index.js", "repo/README.md"])));
    addTest("stripCommonRoot keeps mixed roots", (() => {
      const result = stripCommonRoot(["README.md", "src/index.js"]);
      return result.rootPrefix === "" && result.displayPaths[0] === "README.md";
    })(), JSON.stringify(stripCommonRoot(["README.md", "src/index.js"])));
    addTest("buildTree orders directories before files", (() => {
      const tree = buildTree(["z.txt", "src/b.js", "src/a.js"]);
      const ordered = collectFilesInTreeOrder(tree);
      return JSON.stringify(ordered) === JSON.stringify(["src/a.js", "src/b.js", "z.txt"]);
    })(), JSON.stringify(collectFilesInTreeOrder(buildTree(["z.txt", "src/b.js", "src/a.js"]))));
    addTest("anchorId is stable", anchorId("src/index.js") === anchorId("src/index.js"), `${anchorId("src/index.js")} !== ${anchorId("src/index.js")}`);
    addTest("getFence expands for embedded backticks", getFence("aaa ``` bbb") === "````", getFence("aaa ``` bbb"));
    addTest("binary detection flags png", isLikelyText("image.png", new Uint8Array([137, 80, 78, 71])) === false, "png should be binary");
    addTest("text detection accepts utf8 text", isLikelyText("index.js", new TextEncoder().encode("console.log('hi');")) === true, "text should be detected");
    addTest("buildDownloadName prepends local timestamp", buildDownloadName("web-game", new Date(2026, 2, 23, 11, 12)) === "20260323T11:12-web-game.md", buildDownloadName("web-game", new Date(2026, 2, 23, 11, 12)));
    addTest("markdown contains both sections", (() => {
      const tree = buildTree(["README.md"]);
      const md = buildMarkdown({
        repoName: "repo",
        tree,
        binaryCount: 0,
        sourceKind: "folder",
        ignoredCount: 0,
        ignoredDirectoryNames,
        files: [{ path: "README.md", isText: true, content: "# Hello" }],
      });
      return md.includes("## 1. File Tree") && md.includes("## 2. File Contents") && md.includes("[README.md](#");
    })(), "Markdown sections missing");
  } catch (error) {
    tests.push({ name: "Unexpected test runner error", pass: false, details: error.message || String(error) });
  }

  return tests;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

export default function RepoZipToMarkdownApp() {
  const zipInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const [sourceKind, setSourceKind] = useState("none");
  const [sourceLabel, setSourceLabel] = useState("");
  const [zipFile, setZipFile] = useState(null);
  const [folderFiles, setFolderFiles] = useState([]);
  const [markdown, setMarkdown] = useState("");
  const [downloadName, setDownloadName] = useState(buildDownloadName("repo"));
  const [status, setStatus] = useState("Loading ZIP support...");
  const [error, setError] = useState("");
  const [zipSupportError, setZipSupportError] = useState("");
  const [busy, setBusy] = useState(false);
  const [jsZipReady, setJsZipReady] = useState(false);
  const [ignoreInput, setIgnoreInput] = useState(DEFAULT_IGNORED_DIRECTORIES.join(", "));
  const [stats, setStats] = useState({
    repoName: "—",
    totalFiles: 0,
    binaryFiles: 0,
    ignoredFiles: 0,
    sourceType: "—",
  });
  const [selfTests] = useState(() => runSelfTests());

  const ignoredDirectoryNames = useMemo(() => parseIgnoredDirectoryNames(ignoreInput), [ignoreInput]);
  const hasOutput = markdown.length > 0;
  const hasSource = sourceKind === "zip" ? Boolean(zipFile) : folderFiles.length > 0;
  const passedTests = selfTests.filter((test) => test.pass).length;

  const previewStats = useMemo(() => {
    return {
      lines: markdown ? markdown.split("\n").length : 0,
      chars: markdown.length,
    };
  }, [markdown]);

  useEffect(() => {
    let cancelled = false;

    ensureJSZip()
      .then(() => {
        if (cancelled) return;
        setJsZipReady(true);
        setStatus("Ready. Choose a ZIP file or a local folder.");
      })
      .catch((err) => {
        if (cancelled) return;
        setZipSupportError(err?.message || "Unable to load ZIP support.");
        setStatus("ZIP support could not be loaded, but folder export is still available.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function resetOutputState(nextRepoName) {
    setMarkdown("");
    setError("");
    setStats({
      repoName: "—",
      totalFiles: 0,
      binaryFiles: 0,
      ignoredFiles: 0,
      sourceType: "—",
    });
    setDownloadName(buildDownloadName(nextRepoName || "repo"));
  }

  function handleZipSelection(file) {
    setSourceKind(file ? "zip" : "none");
    setZipFile(file || null);
    setFolderFiles([]);
    const nextLabel = file?.name || "";
    setSourceLabel(nextLabel);
    resetOutputState(getBaseName(nextLabel || "repo"));
    setStatus(file ? `Ready to process ZIP: ${file.name}` : "Ready. Choose a ZIP file or a local folder.");
  }

  function handleFolderSelection(fileList) {
    const files = Array.from(fileList || []);
    setSourceKind(files.length ? "folder" : "none");
    setZipFile(null);
    setFolderFiles(files);

    const firstRelativePath = normalizePath(files[0]?.webkitRelativePath || files[0]?.name || "repo");
    const guessedRepoName = firstRelativePath.includes("/") ? firstRelativePath.split("/")[0] : getBaseName(firstRelativePath);

    setSourceLabel(guessedRepoName);
    resetOutputState(guessedRepoName);
    setStatus(files.length ? `Ready to process folder: ${guessedRepoName} (${files.length} file${files.length === 1 ? "" : "s"} selected)` : "Ready. Choose a ZIP file or a local folder.");
  }

  async function generateMarkdown() {
    if (!hasSource) {
      setError("Please choose a ZIP file or a local folder first.");
      return;
    }

    if (sourceKind === "zip" && (!jsZipReady || !window.JSZip)) {
      setError("ZIP library is not ready yet. Try folder mode, or wait for ZIP support to finish loading.");
      return;
    }

    setBusy(true);
    setError("");
    setMarkdown("");

    try {
      let prepared;

      if (sourceKind === "zip") {
        setStatus("Reading ZIP file...");
        const zip = await window.JSZip.loadAsync(zipFile);

        const rawEntries = Object.values(zip.files)
          .filter((entry) => !entry.dir)
          .map((entry) => ({
            entry,
            originalPath: normalizePath(entry.name),
          }));

        prepared = prepareDisplayEntries(rawEntries, zipFile.name, ignoredDirectoryNames);
      } else {
        setStatus("Reading local folder...");
        const rawEntries = folderFiles.map((file) => ({
          file,
          originalPath: normalizePath(file.webkitRelativePath || file.name),
        }));

        prepared = prepareDisplayEntries(rawEntries, sourceLabel || "repo", ignoredDirectoryNames);
      }

      const { repoName, ignoredCount, displayEntries } = prepared;
      const pathToItem = new Map(displayEntries.map((item) => [item.path, item]));
      const tree = buildTree(displayEntries.map((item) => item.path));
      const orderedPaths = collectFilesInTreeOrder(tree);
      const files = [];
      let binaryCount = 0;

      for (let i = 0; i < orderedPaths.length; i += 1) {
        const path = orderedPaths[i];
        const item = pathToItem.get(path);
        if (!item) continue;

        setStatus(`Reading files ${i + 1} of ${orderedPaths.length}...`);

        const bytes = await readItemBytes(item);
        const isText = isLikelyText(path, bytes);
        const content = isText ? decodeText(bytes) : "";

        if (!isText) binaryCount += 1;
        files.push({ path, isText, content });
      }

      setStatus("Building Markdown document...");
      const output = buildMarkdown({
        repoName,
        tree,
        files,
        binaryCount,
        sourceKind,
        ignoredCount,
        ignoredDirectoryNames,
      });

      const nextDownloadName = buildDownloadName(repoName);
      setMarkdown(output);
      setStats({
        repoName,
        totalFiles: files.length,
        binaryFiles: binaryCount,
        ignoredFiles: ignoredCount,
        sourceType: sourceKind === "folder" ? "Folder" : "ZIP",
      });
      setDownloadName(nextDownloadName);
      setStatus("Done. Your Markdown file is ready to preview, copy, or download.");
    } catch (err) {
      setError(err?.message || "Something went wrong while processing the selected source.");
      setStatus("Unable to generate the Markdown file.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!markdown) return;
    const repoName = stats.repoName !== "—" ? stats.repoName : getBaseName(sourceLabel || "repo");
    const filename = buildDownloadName(repoName);
    setDownloadName(filename);
    downloadTextFile(filename, markdown);
    setStatus(`Downloaded ${filename}`);
  }

  async function copyMarkdown() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Markdown copied to your clipboard.");
    } catch (err) {
      setError(err?.message || "Clipboard copy failed.");
    }
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleZipSelection(file);
    }
  }

  function onDragOver(event) {
    event.preventDefault();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Repo ZIP or Folder to Linked Markdown Export</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Choose a repository ZIP or use the browser&apos;s folder picker for a local repo folder, generate a Markdown file with a linked file tree,
            ignore folders like node_modules, and save the result locally with a timestamped filename.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Select Source" subtitle="ZIP upload and local folder export are both supported in the browser.">
            <div className="space-y-4">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(event) => {
                  handleZipSelection(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={(event) => {
                  handleFolderSelection(event.target.files || []);
                  event.target.value = "";
                }}
              />

              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center"
              >
                <div className="mb-3 rounded-full bg-slate-100 px-4 py-3 text-lg">📦</div>
                <div className="text-sm font-medium">Drop a ZIP here, or choose a ZIP or folder below</div>
                <div className="mt-1 text-xs text-slate-500">
                  Folder mode uses the browser&apos;s local directory picker. Ignore rules apply to both ZIP and folder mode.
                </div>
                {sourceLabel ? <div className="mt-4 rounded-full bg-slate-900 px-3 py-1 text-xs text-white">{sourceLabel}</div> : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => zipInputRef.current?.click()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Choose ZIP
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                >
                  Choose Folder
                </button>
                <button
                  onClick={generateMarkdown}
                  disabled={!hasSource || busy || (sourceKind === "zip" && !jsZipReady)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working..." : "Generate Markdown"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!hasOutput || busy}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download .md
                </button>
                <button
                  onClick={copyMarkdown}
                  disabled={!hasOutput || busy}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy
                </button>
              </div>

              <div className="space-y-2 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                <label className="block font-medium" htmlFor="ignore-input">
                  Ignored folders
                </label>
                <input
                  id="ignore-input"
                  value={ignoreInput}
                  onChange={(event) => setIgnoreInput(event.target.value)}
                  placeholder="node_modules, npm_modules, .git"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                />
                <div className="text-xs text-slate-500">
                  Any matching directory name is skipped anywhere in the tree.
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                <div className="font-medium">Status</div>
                <div className="mt-1">{status}</div>
                {zipSupportError ? <div className="mt-3 text-sm text-amber-700">ZIP support note: {zipSupportError}</div> : null}
                {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Export Summary" subtitle="Updated after generation.">
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Repository" value={stats.repoName} />
              <StatBox label="Source type" value={stats.sourceType} />
              <StatBox label="Files" value={stats.totalFiles} />
              <StatBox label="Ignored files" value={stats.ignoredFiles} />
              <StatBox label="Binary placeholders" value={stats.binaryFiles} />
              <StatBox label="Download name" value={downloadName} />
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Preview metrics</div>
              <div className="mt-2 text-sm text-slate-700">
                {previewStats.lines} lines · {previewStats.chars.toLocaleString()} characters
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Runtime checks</div>
              <div className="mt-2 text-sm text-slate-700">
                {passedTests} / {selfTests.length} passed
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Markdown Preview" subtitle="Review the generated export before saving it locally.">
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            placeholder="Your generated Markdown will appear here..."
            className="min-h-[32rem] w-full rounded-3xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 outline-none"
          />
        </SectionCard>

        <SectionCard title="Built-in Tests" subtitle="These check path filtering, folder ignore rules, timestamped filenames, tree order, anchors, text detection, and markdown generation.">
          <div className="space-y-2">
            {selfTests.map((test, index) => (
              <div
                key={`${test.name}-${index}`}
                className={`rounded-2xl border px-4 py-3 text-sm ${test.pass ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
              >
                <div className="font-medium">{test.pass ? "PASS" : "FAIL"} — {test.name}</div>
                <div className="mt-1 break-words text-xs opacity-80">{test.details}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
