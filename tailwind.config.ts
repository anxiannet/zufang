import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./actions/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14211f",
        muted: "#667773",
        line: "#dce7e3",
        brand: {
          DEFAULT: "#0f766e",
          dark: "#0b5f59",
          light: "#e8f5f2"
        },
        surface: "#f7faf9"
      },
      borderRadius: {
        "2xl": "1.25rem"
      },
      boxShadow: {
        card: "0 12px 36px -24px rgba(15, 73, 67, 0.35)",
        lift: "0 20px 50px -28px rgba(15, 73, 67, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
