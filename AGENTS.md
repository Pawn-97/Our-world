# AGENTS.md

# Our World — Agent Operating Instructions

This file defines how coding agents must work in this repository.

The project is intentionally optimized for agent-driven development.  
Agents must prioritize product clarity, architectural simplicity, and safe incremental changes.

---

## 1. Read Before Working

Before making changes, read:

1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. `MVP.md`
4. this `AGENTS.md`
5. any scoped `AGENTS.md` inside the directory being modified
6. relevant existing code before proposing replacement architecture

If the project is based on StarMap, also read the upstream/local StarMap documentation relevant to the files being changed.

---

## 2. Product North Star

The product model is:

> **World → Place → Visit → Memory**

The experience model is:

> **3D Earth → Place → Memory**

The product is not a generic travel planner.

When deciding between two implementations, prefer the one that improves:

1. globe quality,
2. place comprehension,
3. memory browsing,
4. mobile experience,
5. maintainability.

---

## 3. V1 Operating Model

V1 is:

> **Local authoring → static publishing**

Only one owner edits locally.

Production is read-only.

The second person can browse production from mobile and desktop.

Do not introduce cloud infrastructure into V1 unless the repository owner explicitly changes the product scope.

---

## 4. Hard Constraints

Agents must not add the following to V1 without explicit instruction:

- Supabase,
- Firebase,
- cloud database,
- authentication,
- online write APIs,
- realtime sync,
- cloud media storage,
- server runtime,
- Express,
- custom Node backend,
- Docker,
- Redis,
- microservices,
- a second map engine,
- native mobile apps.

Do not anticipate V2 by secretly building V2.

Prepare clean interfaces only.

---

## 5. Base Project / StarMap Rule

StarMap may be used as the technical foundation.

Prefer reusing proven StarMap implementation for:

- Cesium setup,
- imagery sources,
- camera navigation,
- markers,
- geospatial helpers,
- local media processing,
- static build,
- responsive globe behavior.

Do not preserve unrelated StarMap product concepts merely because they exist.

Remove or isolate features that conflict with Our World.

Examples of features that may be removed if unused:

- drone-specific workflows,
- meteor/gimmick effects,
- portfolio-specific content,
- unrelated journey UI,
- update features not needed by Our World.

Do not rewrite working Cesium infrastructure without a concrete reason.

---

## 6. Architecture Rules

### 6.1 Components must not own persistence

UI components must not directly import and mutate core JSON data.

Use repositories.

Bad:

```ts
import places from "../data/places.json";
```

Good:

```ts
const places = await placeRepository.list();
```

### 6.2 Media paths must be centralized

Do not hardcode media paths throughout components.

Use media metadata and a media service.

### 6.3 Stable IDs are mandatory

Never use array indexes, display names, or file names as persistent IDs.

### 6.4 Domain types are authoritative

Prefer shared domain types over duplicate feature-specific shapes.

### 6.5 Keep the dependency graph simple

Do not add new packages for trivial functionality.

### 6.6 Cesium code stays isolated

Avoid leaking Cesium-specific objects into unrelated domain/UI layers.

Application components should work with product-level data such as `Place`, not Cesium entities.

---

## 7. UX Rules

### Globe

The globe is the primary experience, not a decorative hero.

Changes must preserve:

- smooth navigation,
- clear marker hierarchy,
- visual calm,
- camera predictability.

### Desktop

Use map-first layouts and side-panel patterns where appropriate.

### Mobile

Do not shrink desktop UI.

Prefer:

- bottom sheets,
- full-screen detail views,
- large touch targets,
- simplified map controls.

### Place

A place may have multiple visits.

Do not flatten all memories into one undifferentiated place feed if visit context matters.

### Memory

Memory presentation should feel editorial and personal.

Avoid dashboard-like presentation unless necessary.

---

## 8. Scope Discipline

Before implementing a feature, check `MVP.md`.

If it is explicitly out of scope:

- do not build it,
- do not build preparatory runtime infrastructure for it,
- mention the conflict if the request appears accidental.

The project owner may intentionally change scope; explicit new instructions override the current MVP.

---

## 9. Change Strategy

Prefer small, testable increments.

For non-trivial changes:

1. inspect existing implementation,
2. identify the smallest coherent change,
3. preserve working behavior,
4. add/update tests,
5. run validation,
6. report what changed.

Do not perform broad rewrites because a cleaner architecture is imaginable.

---

## 10. Agent Decision Priorities

When tradeoffs exist, use this order:

1. correctness,
2. user experience,
3. mobile usability,
4. performance,
5. architectural clarity,
6. low operational cost,
7. development speed,
8. visual polish,
9. novelty.

Visual polish remains important, but not at the cost of unstable globe behavior.

---

## 11. Performance Rules

The application must remain usable on mobile.

Agents should:

- avoid unnecessary React rerenders around Cesium,
- lazy-load galleries,
- use thumbnails,
- reduce expensive effects on mobile,
- avoid mounting large hidden trees,
- profile before introducing custom performance complexity.

Do not optimize hypothetical bottlenecks before they appear.

---

## 12. Media Rules

V1 media is local-first.

Preferred pipeline:

```text
source media
→ validate
→ generate optimized derivative
→ generate thumbnail
→ publish derivative
```

Do not commit sensitive or unintended original media automatically.

If EXIF/GPS metadata is extracted, treat location information as potentially private and include it only when the product intentionally uses it.

---

## 13. Privacy Rules

Before deployment, ensure:

- no tokens,
- no `.env.local`,
- no private editor state,
- no unpublished notes,
- no unintended original media,
- no local absolute file paths.

A privacy validation command should exist and be part of CI.

Never print or commit access tokens.

---

## 14. Testing Rules

At minimum, protect:

### Unit

- data parsing,
- repository behavior,
- status handling,
- date ordering,
- media metadata,
- schema validation.

### Integration / E2E

- world loads,
- place marker can be opened,
- place detail loads,
- visit can be browsed,
- gallery opens,
- mobile preview flow works.

Do not rely only on snapshots.

---

## 15. Build Rules

Before considering a task complete, run the relevant checks.

Preferred full validation:

```text
npm run lint
npm run typecheck
npm run test
npm run validate
npm run privacy:check
npm run build
```

If scripts differ, run the closest equivalents.

Do not declare success if the production build fails.

---

## 16. Deployment Rules

Production target for V1:

- GitHub Pages,
- static build,
- no required server.

GitHub Actions should block deployment if:

- typecheck fails,
- tests fail,
- content validation fails,
- privacy check fails,
- production build fails.

---

## 17. Git Rules

Keep commits scoped and understandable.

Recommended commit style:

```text
feat(globe): add place fly-to behavior
feat(memory): add photo timeline cards
fix(mobile): prevent sheet from blocking globe gestures
refactor(data): introduce local place repository
```

Do not combine unrelated refactors, features, and visual changes in one change unless necessary.

Do not rewrite repository history unless explicitly requested.

---

## 18. File Organization

Prefer feature-oriented organization.

Example:

```text
src/
├── app/
├── domain/
├── repositories/
├── services/
├── features/
│   ├── globe/
│   ├── places/
│   ├── visits/
│   └── memories/
└── shared/
```

Do not create excessive abstraction layers.

A directory should exist because it improves comprehension, not because a pattern says it should.

---

## 19. V2 Compatibility Rules

V1 must remain cloud-migratable.

Required preparation:

- repository interfaces,
- media service abstraction,
- stable IDs,
- clean domain models.

Not required in V1:

- cloud SDKs,
- auth placeholders,
- fake networking,
- unused API routes,
- environment configuration for services that do not exist yet.

The correct strategy is:

> **interface now, infrastructure later**

---

## 20. How to Handle Ambiguity

When requirements are ambiguous:

1. inspect `PRODUCT.md`,
2. inspect `MVP.md`,
3. preserve the simplest behavior consistent with the product model,
4. prefer reversible decisions,
5. document any material assumption.

Do not expand scope to resolve ambiguity.

---

## 21. Quality Bar

A feature is not complete because it renders.

It is complete when:

- the behavior is understandable,
- desktop works,
- mobile works,
- edge cases are handled,
- loading/error/empty states are considered where relevant,
- tests cover meaningful logic,
- the production build passes,
- the result aligns with Place → Memory.

---

## 22. Anti-Patterns

Avoid:

- direct JSON access from components,
- giant all-purpose React components,
- mixing Cesium objects with domain objects,
- making every feature a modal,
- desktop-only interactions,
- hidden cloud dependencies,
- premature backend architecture,
- duplicated data shapes,
- hardcoded coordinates inside UI components,
- loading full-size images for thumbnails,
- adding features because the upstream project has them.

---

## 23. Completion Report

When finishing a meaningful task, report:

- what changed,
- why,
- files changed,
- tests/checks run,
- known limitations,
- whether product/MVP scope changed.

Keep the report concise.

---

## 24. Final Principle

This project should stay easy for future agents to understand.

Prefer a boring, explicit architecture over a clever one.

The goal is not to demonstrate engineering complexity.

The goal is to create a beautiful, durable spatial memory product.
