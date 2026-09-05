/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7B1113', // SCARO Logo Brand Crimson / Burgundy
          hover: '#5F0A0E', // Darker Crimson Hover
          muted: '#FBECEE', // Light Crimson Tint
          foreground: '#FFFFFF', // High-contrast White
        },
        secondary: {
          DEFAULT: '#C59B3F', // SCARO Brand Champagne Gold
          hover: '#AA812A', // Darker Gold Hover
          muted: '#FEF9EE', // Light Gold Tint
          foreground: '#4A3508',
        },
        accent: {
          DEFAULT: '#C59B3F', // SCARO Logo Orbital Gold Accent
          hover: '#AA812A',
          muted: '#FEF9EE',
          foreground: '#4A3508',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F9FAFB', // Neutral canvas background
          card: '#FFFFFF',
        },
        content: {
          DEFAULT: '#1F2937', // Deep Charcoal (gray-800)
          muted: '#6B7280', // Neutral Gray (gray-500)
          inverse: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E5E7EB', // Light neutral gray (gray-200)
          hover: '#D1D5DB', // gray-300
          accent: '#F3E5C8', // Subtle gold border
        },
        status: {
          success: '#059669', // emerald-600
          warning: '#D97706', // amber-600
          danger: '#DC2626', // red-600
          info: '#2563EB', // blue-600
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
