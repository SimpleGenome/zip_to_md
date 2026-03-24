const { useEffect, useMemo, useState } = React;

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

function shouldSkipPath(path) {
  return !path || path.startsWith("__MACOSX/") || path === ".DS_Store" || path.endsWith("/.DS_Store");
}

function getBaseName(filename) {
  return String(filename || "repo").replace(/\.zip$/i, "") || "repo";
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

function buildMarkdown({ repoName, tree, files, binaryCount }) {
  const lines = [];

  lines.push(`# ${repoName} Repository Export`);
  lines.push("");
  lines.push("Generated from a ZIP upload on the client side.");
  lines.push("");
  lines.push(`Total files: **${files.length}**`);
  lines.push("");

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

function runSelfTests() {
  const tests = [];

  function addTest(name, pass, details) {
    tests.push({ name, pass, details: pass ? "OK" : details || "Failed" });
  }

  try {
    addTest("normalizePath converts slashes", normalizePath("./a\\b//c/") === "a/b/c", normalizePath("./a\\b//c/"));
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
    addTest("markdown contains both sections", (() => {
      const tree = buildTree(["README.md"]);
      const md = buildMarkdown({
        repoName: "repo",
        tree,
        binaryCount: 0,
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
  const [zipFile, setZipFile] = useState(null);
  const [markdown, setMarkdown] = useState("");
  const [downloadName, setDownloadName] = useState("repo-export.md");
  const [status, setStatus] = useState("Loading ZIP support...");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [jsZipReady, setJsZipReady] = useState(false);
  const [stats, setStats] = useState({ repoName: "—", totalFiles: 0, binaryFiles: 0 });
  const [selfTests] = useState(() => runSelfTests());

  const hasOutput = markdown.length > 0;
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
        setStatus("Upload a repo ZIP file to begin.");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Unable to load ZIP support.");
        setStatus("ZIP support could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleZipSelection(file) {
    setZipFile(file || null);
    setMarkdown("");
    setError("");
    setStats({ repoName: "—", totalFiles: 0, binaryFiles: 0 });
    setDownloadName(`${getBaseName(file?.name || "repo")}-export.md`);
    setStatus(file ? `Ready to process: ${file.name}` : "Upload a repo ZIP file to begin.");
  }

  async function generateMarkdown() {
    if (!zipFile) {
      setError("Please choose a ZIP file first.");
      return;
    }

    if (!jsZipReady || !window.JSZip) {
      setError("ZIP library is not ready yet. Please try again in a moment.");
      return;
    }

    setBusy(true);
    setError("");
    setMarkdown("");

    try {
      setStatus("Reading ZIP file...");
      const zip = await window.JSZip.loadAsync(zipFile);

      const fileEntries = Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => ({
          entry,
          originalPath: normalizePath(entry.name),
        }))
        .filter(({ originalPath }) => !shouldSkipPath(originalPath));

      if (!fileEntries.length) {
        throw new Error("No files were found in that ZIP archive.");
      }

      const normalizedPaths = fileEntries.map(({ originalPath }) => originalPath);
      const { rootPrefix, displayPaths } = stripCommonRoot(normalizedPaths);
      const repoName = rootPrefix || getBaseName(zipFile.name);

      const displayEntries = fileEntries.map((item, index) => ({
        entry: item.entry,
        path: displayPaths[index],
      }));

      const pathToEntry = new Map(displayEntries.map((item) => [item.path, item.entry]));
      const tree = buildTree(displayEntries.map((item) => item.path));
      const orderedPaths = collectFilesInTreeOrder(tree);
      const files = [];
      let binaryCount = 0;

      for (let i = 0; i < orderedPaths.length; i += 1) {
        const path = orderedPaths[i];
        const entry = pathToEntry.get(path);
        if (!entry) continue;

        setStatus(`Reading files ${i + 1} of ${orderedPaths.length}...`);

        const bytes = await entry.async("uint8array");
        const isText = isLikelyText(path, bytes);
        const content = isText ? decodeText(bytes) : "";

        if (!isText) binaryCount += 1;

        files.push({ path, isText, content });
      }

      setStatus("Building Markdown document...");
      const output = buildMarkdown({ repoName, tree, files, binaryCount });

      setMarkdown(output);
      setStats({ repoName, totalFiles: files.length, binaryFiles: binaryCount });
      setDownloadName(`${repoName.replace(/[^a-z0-9-_]+/gi, "-") || "repo"}-export.md`);
      setStatus("Done. Your Markdown file is ready to preview, copy, or download.");
    } catch (err) {
      setError(err?.message || "Something went wrong while processing the ZIP file.");
      setStatus("Unable to generate the Markdown file.");
    } finally {
      setBusy(false);
    }
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
    if (file) handleZipSelection(file);
  }

  function onDragOver(event) {
    event.preventDefault();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Repo ZIP to Linked Markdown Export</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Upload a repository ZIP, generate a Markdown file with a linked file tree and every file printed in the same order,
            then save the result locally.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Upload ZIP" subtitle="No build-time package imports. JSZip loads dynamically at runtime.">
            <div className="space-y-4">
              <label
                onDrop={onDrop}
                onDragOver={onDragOver}
                className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-slate-400 hover:bg-slate-50"
              >
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(event) => handleZipSelection(event.target.files?.[0] || null)}
                />
                <div className="mb-3 rounded-full bg-slate-100 px-4 py-3 text-lg">📦</div>
                <div className="text-sm font-medium">Drop a ZIP here or click to browse</div>
                <div className="mt-1 text-xs text-slate-500">
                  Best for source repos. Binary files are listed and included as placeholders.
                </div>
                {zipFile ? <div className="mt-4 rounded-full bg-slate-900 px-3 py-1 text-xs text-white">{zipFile.name}</div> : null}
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={generateMarkdown}
                  disabled={!zipFile || busy || !jsZipReady}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working..." : "Generate Markdown"}
                </button>
                <button
                  onClick={() => downloadTextFile(downloadName, markdown)}
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

              <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                <div className="font-medium">Status</div>
                <div className="mt-1">{status}</div>
                {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Export Summary" subtitle="Updated after generation.">
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Repository" value={stats.repoName} />
              <StatBox label="Files" value={stats.totalFiles} />
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

        <SectionCard title="Built-in Tests" subtitle="These check core path, tree-order, anchor, fence, text-detection, and markdown-generation logic.">
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
