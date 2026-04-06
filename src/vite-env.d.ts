/// <reference types="vite/client" />

declare module '*.xsd?raw' {
  const content: string;
  export default content;
}
