/// <reference types="vite/client" />

declare module '*.py?raw' {
  const src: string;
  export default src;
}
declare module '*/react.production.min.js?raw' {
  const src: string;
  export default src;
}
declare module '*/react-dom.production.min.js?raw' {
  const src: string;
  export default src;
}
