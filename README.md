# Global Todo App

A friendly, multilingual to-do list built with **plain HTML, CSS and JavaScript**. It has no frameworks, no build step and no backend. Tasks are saved in your browser's `localStorage`, so the app works offline and deploys anywhere as a static site.

## Features

- **Tasks:** each task has notes, a priority (low / medium / high), a due date and a category (Work, Home, Personal or Others). Older tasks with no category or unknown category text show as Others.
- **Validation:** Add task and Edit task follow the same rules:
  - A task name is 3–120 characters and must contain a letter or number, in any language. Chinese names may be 2 characters.
  - Priority, due date and category are required.
  - The due date must be today or later.
  - Errors appear in red under the field, and the cursor moves to the first problem.
- **Task menu:** each card has a **⋯** button with Edit, Move up, Move down and Delete. It works with the keyboard and opens upward near the bottom of the screen. Delete shows a toast with **Undo** for about 6 seconds.
- **Reordering:** drag the ⋮⋮ handle (mouse or touch), or use Move up / Move down in the ⋯ menu.
- **Finding tasks:** All / Pending / Completed tabs, plus one compact row with search, a category filter and 6 sort options.
- **Look:** a deep-teal brand colour (brighter teal in dark mode), a globe-and-checkmark logo and the Rubik font from Google Fonts. Without internet, the app falls back to the system font.
- **Stats:** total, pending, completed and overdue counts, plus a progress bar.
- **Dark mode:** follows your system setting the first time, then remembers your choice.
- **Backup:** export to a JSON file, and import one after a confirmation, with Undo.
- **8 languages:** English, Français, Español, 简体中文, Русский, Português, Deutsch and العربية. Each has an inline SVG flag. Arabic switches the layout to right-to-left. The app detects your browser language on the first visit and remembers your choice after that.
- **Mobile-friendly:** tap targets are at least 44px, and on phones the header tools are grouped in a **Settings** menu.

## Project structure

```
index.html   Page structure and the icon sprite
style.css    Styling: light/dark themes, mobile layout, RTL support
i18n.js      Languages, SVG flags and all interface translations
app.js       App logic: tasks, rendering, drag & drop, storage, import/export
README.md    This file
```

## Run it locally

No install is needed. **Double-click `index.html`** to open it in your browser.

To serve it like a real website instead, which can be handy for testing on your phone over Wi-Fi:

```bash
npx serve .
```

Then open the URL it prints, for example http://localhost:3000.

## Deploy to Vercel

`index.html` is in the root folder, so Vercel serves it as a static site with no configuration.

### Option A: GitHub + Vercel dashboard (recommended)

This option redeploys automatically every time you push.

1. Create an **empty** repository on [github.com](https://github.com/new), for example `global-todo-app`. Don't add a README there.
2. Push this project to it:
   ```bash
   git remote add origin https://github.com/<your-username>/global-todo-app.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com), sign in with GitHub, and click **Add New… → Project**.
4. **Import** the `global-todo-app` repository.
5. Use these settings:
   - **Framework Preset:** `Other`
   - **Root Directory:** `./`
   - **Build Command:** leave empty
   - **Output Directory:** leave empty
6. Click **Deploy**. After a few seconds you'll get a live URL such as `https://global-todo-app.vercel.app`.

From then on, every `git push` to `main` redeploys the site automatically.

### Option B: Vercel CLI

```bash
npm install -g vercel
vercel          # first time: log in, then accept the defaults
vercel --prod   # publish to your production URL
```

## Good to know

- **Data is per browser.** Your phone and your laptop each keep their own list. To move tasks between devices, use **Export backup** on one and **Import backup** on the other.
- **Clearing your browser data deletes your tasks.** Export a backup now and then.
- **Date pickers use your browser's settings.** The date picker (`<input type="date">`) is drawn by the browser, so its format follows your browser or OS language. Every other date in the app follows the selected language.
- **Adding a language:** add an entry to `LANGUAGES` and a matching block of strings in `STRINGS`, both in `i18n.js`. Any missing text falls back to English.
