# Tasks: gh-32-sidebar-2level-tree

- [x] Flatten sidebar tree from 3-level (Instance > Project > Loop) to 2-level (Project(instance) > Loop)
- [x] Replace dropdown instance filter with free-text search input
- [x] Add toolbar with sort (stub), connect instance, and new project (stub) buttons
- [x] Implement project node design with color dot, instance badge, loop count
- [x] Implement loop node design with status dot, fleet status label, run count
- [x] Implement single-instance UX (suppress instance badge when only one environment)
- [x] Update theme.css with new search, toolbar, badge, and loop info styles
- [x] Add i18n keys for sidebar.searchPlaceholder, sidebar.projects, sidebar.noProjects, sidebar.noSearchResults, sidebar.sort, sidebar.connectInstance, sidebar.newProject
- [x] Simplify Sidebar props interface — remove unused callbacks and data
- [x] Update App.tsx Sidebar usage to match simplified props
- [x] Verify TypeScript compilation passes
