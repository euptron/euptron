---
title: "Your note title here"
summary: "One-line excerpt shown in the notes listing."
tags:
  - optional
  - tags
type: post
---

Body goes here in plain Markdown. Everything below the frontmatter
is stored verbatim in `notes.json` and rendered on the website with Marked.js.

## Supported out of the box

- Headings, lists, tables
- `inline code`

```kt
// fenced code blocks with language hints
fun main {
   println("Hello, euptron")
}
```

> Blockquotes

[Links](https://github.com/euptron) and ![images](https://avatars.githubusercontent.com/u/110324005?v=4)

| Column A | Column B |
|----------|----------|
| cell     | cell     |

---

Frontmatter rules:

- `title` (required) for the heading in the list & post page
- `summary` (recommended) for the excerpt in the notes list
- `tags` (optional) for the YAML list
- `type` (optional) for the `post` or `note`
- `date` come from Git history automatically so no need to add it.
