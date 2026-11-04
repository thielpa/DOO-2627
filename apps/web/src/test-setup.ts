import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrolling; TanStack Router calls it on navigation.
window.scrollTo = () => {};
