const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    // lg y xl no son pantallas normales: se definen abajo como variantes que además respetan la
    // vista elegida en el teléfono (clases vista-movil / vista-escritorio en <html>)
    screens: { sm: '640px', md: '768px', '2xl': '1536px' },
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 4px)',
        lg: 'calc(var(--radius) + 2px)',
        xl: 'calc(var(--radius) + 6px)',
      },
      maxWidth: { 'screen-lg': '1024px', 'screen-xl': '1280px' },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Diseño de computador: pantalla ancha (salvo que se eligió la vista celular) o la vista
    // computador elegida a mano en el teléfono
    plugin(({ addVariant }) => {
      addVariant('lg', [
        '@media (min-width: 1024px) { html:not(.vista-movil) & }',
        'html.vista-escritorio &',
      ]);
      addVariant('xl', '@media (min-width: 1280px) { html:not(.vista-movil) & }');
    }),
  ],
};
