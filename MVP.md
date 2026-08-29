# MVP.md

# Our World — V1 MVP Scope

## 1. MVP Goal

Deliver a polished, usable version of Our World that can be maintained locally by one editor and browsed online by both people.

The MVP must prove:

1. the 3D globe experience,
2. the Place → Visit → Memory model,
3. the local authoring workflow,
4. the static publishing workflow,
5. desktop and mobile browsing quality.

---

## 2. Definition of Done

V1 is done when the following real workflow works end to end:

```text
Open local editor
→ Add Tokyo
→ Mark Tokyo visited
→ Add May 2026 visit
→ Add note/activity/photo memories
→ Preview Tokyo
→ Build
→ Push to GitHub
→ GitHub Pages updates
→ Open site on iPhone
→ Explore globe
→ Tap Tokyo
→ Browse memories
```

---

## 3. MVP Feature Scope

### A. 3D World

Must have:

- interactive Cesium globe,
- rotate,
- zoom,
- pan,
- reset-to-world,
- smooth fly-to-place,
- place markers,
- visited/wishlist visual distinction,
- basic place search,
- desktop and mobile controls.

Should have:

- atmosphere/space treatment,
- country-level context,
- sensible camera transitions.

Not required:

- photorealistic 3D buildings everywhere,
- complex weather,
- animated flights,
- route replay,
- multiple map engines.

---

### B. Place

Must have:

- place name,
- country/region,
- coordinates,
- status,
- optional cover,
- summary,
- place preview from globe,
- dedicated place detail view.

Statuses:

- wishlist,
- planned,
- visited.

---

### C. Visit

Must have:

- one place can contain multiple visits,
- optional date range,
- optional title,
- optional summary,
- visit selection on place detail.

The visit model must exist even if the initial UI visually minimizes it.

---

### D. Memory

Must have:

- note memory,
- activity memory,
- photo memory,
- date,
- text,
- optional location,
- media association.

Must support:

- chronological display,
- readable timeline,
- memory editing locally,
- memory deletion locally,
- memory ordering.

---

### E. Photo

Must have:

- local image import,
- generated thumbnail,
- optimized published image,
- gallery,
- full-size/lightbox view,
- alt text fallback.

Nice to have:

- EXIF date import,
- GPS extraction.

Out of MVP:

- heavy video processing,
- RAW workflows,
- drone panorama.

---

### F. Local Editor

Must have:

- local-only access,
- add/edit/delete Place,
- add/edit/delete Visit,
- add/edit/delete Memory,
- attach photos,
- validation,
- preview.

The editor must not appear as an online editing capability in production.

---

### G. Publishing

Must have:

- production build,
- private/public content check,
- GitHub Actions deployment,
- GitHub Pages output,
- clear publish instructions.

Target publishing experience:

```text
edit locally
→ validate
→ git commit
→ git push
→ website updates automatically
```

---

### H. Responsive Experience

Desktop must have:

- globe-first layout,
- side-panel style place preview,
- comfortable gallery/detail browsing.

Mobile must have:

- full-screen globe,
- bottom-sheet place preview,
- full-screen place detail,
- touch-safe controls,
- usable gallery,
- mobile globe performance mode.

---

## 4. Explicitly Out of Scope

Do not implement in V1:

- login,
- Supabase,
- online editing,
- realtime sync,
- cloud database,
- cloud media upload,
- comments,
- likes,
- social features,
- public user profiles,
- friend sharing system,
- itinerary booking,
- hotel/flight data,
- budget,
- packing list,
- AI planner,
- complex travel statistics,
- native apps,
- PWA offline authoring,
- video editing,
- drone workflows,
- advanced map layers,
- multiplayer editing.

---

## 5. Recommended Delivery Milestones

### Milestone 0 — Base cleanup

Goal:

Create a clean Our World foundation from StarMap.

Tasks:

- fork or copy permitted StarMap base,
- preserve license/attribution requirements,
- remove unused product-specific demo concepts,
- rename product,
- make current build pass,
- document current structure,
- keep Cesium working.

Exit criteria:

- local dev starts,
- production build succeeds,
- globe renders,
- no Our World features added yet.

---

### Milestone 1 — Globe spike

Goal:

Prove the final core map experience before building data features.

Use only mock places:

- Tokyo,
- Paris,
- Singapore.

Implement:

- world view,
- marker display,
- fly-to,
- place preview,
- mobile globe,
- desktop globe,
- quality modes.

Exit criteria:

- Earth → city interaction feels good,
- mobile does not become unusably slow,
- no obvious camera/gesture conflict.

---

### Milestone 2 — Domain model

Goal:

Implement clean local domain architecture.

Add:

- `World`,
- `Place`,
- `Visit`,
- `Memory`,
- `Media`,
- repository interfaces,
- local repository implementation,
- schema validation.

Exit criteria:

- UI reads only through repositories,
- stable IDs exist,
- no component directly imports core JSON data.

---

### Milestone 3 — Place experience

Goal:

Make the core browsing model usable.

Implement:

- place status,
- place preview,
- place detail,
- multiple visits,
- wishlist/planned/visited distinctions.

Exit criteria:

- a viewer can understand the place model without explanation.

---

### Milestone 4 — Memory experience

Goal:

Make real trip memories worth revisiting.

Implement:

- note,
- activity,
- photo,
- timeline,
- gallery,
- memory detail.

Exit criteria:

- one real trip can be documented end to end.

---

### Milestone 5 — Local editor

Goal:

Make content maintenance practical.

Implement:

- create/update/delete place,
- create/update/delete visit,
- create/update/delete memory,
- image import,
- validation,
- preview.

Exit criteria:

- routine content work does not require editing JSON manually.

---

### Milestone 6 — Production publishing

Goal:

Make the site reliably deployable.

Implement:

- GitHub Actions,
- GitHub Pages,
- privacy check,
- content validation,
- build checks,
- responsive QA.

Exit criteria:

- `git push` produces a working published site automatically.

---

### Milestone 7 — Real-content validation

Goal:

Test the product with actual memories.

Load at least:

- 5–10 places,
- 3–5 real visits,
- 100+ photos,
- 30+ memories.

Observe:

- whether place hierarchy works,
- whether visits are understandable,
- whether memory granularity feels right,
- whether the gallery becomes noisy,
- whether mobile browsing still performs well.

Do not begin V2 before this milestone.

---

## 6. UX Acceptance Criteria

### Globe

- user can understand where they are immediately,
- markers do not overwhelm the globe,
- place selection is reliable,
- fly-to animation does not feel disorienting,
- resetting to global view is obvious.

### Place

- place title and status are immediately clear,
- the first screen communicates why the place matters,
- multiple visits remain understandable.

### Memory

- text and media feel editorial rather than database-like,
- timeline is scannable,
- gallery does not dominate all other context.

### Mobile

- no desktop side panel squeezed into mobile,
- bottom sheet works with touch,
- important actions use comfortable touch targets,
- page remains responsive during globe use.

---

## 7. Technical Acceptance Criteria

Before every release:

```text
npm run lint
npm run typecheck
npm run test
npm run validate
npm run privacy:check
npm run build
```

Exact script names may differ, but equivalent checks must exist.

Production must contain:

- no local editing APIs,
- no secrets,
- no private original media unless explicitly approved,
- no broken asset URLs,
- no debug-only controls.

---

## 8. V1 Release Gate

Do not call the project V1 until all are true:

- [ ] Globe works on desktop.
- [ ] Globe works on mobile.
- [ ] Three statuses work.
- [ ] Multiple visits per place work.
- [ ] Notes work.
- [ ] Activities work.
- [ ] Photos work.
- [ ] Local editor works.
- [ ] Static build works.
- [ ] GitHub Pages deployment works.
- [ ] Privacy check exists.
- [ ] Real travel data has been tested.
- [ ] At least one iPhone and one desktop browser have been manually tested.
- [ ] No cloud backend is required to browse production.

---

## 9. V2 Trigger

Begin V2 only when a real recurring pain appears, such as:

- wanting to add memories directly from a phone,
- wanting the second person to edit,
- local publishing becoming too slow,
- media volume exceeding a comfortable Git/static workflow.

Do not build cloud infrastructure solely because it may be useful later.
