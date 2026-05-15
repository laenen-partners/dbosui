// Slim highlight.js with only the languages we render in the UI.
// Imported once from main.tsx so the registrations run before any
// <CodeHighlight> component mounts.
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';

hljs.registerLanguage('json', json);

export { hljs };
