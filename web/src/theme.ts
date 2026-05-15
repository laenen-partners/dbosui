import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Custom primary palette — refined indigo with a softer accent.
const brand: MantineColorsTuple = [
  '#eef1ff',
  '#dcdff5',
  '#b6bbe5',
  '#8d96d4',
  '#6b75c6',
  '#5560bd',
  '#4955b9',
  '#3a45a3',
  '#323d93',
  '#283482',
];

export const theme = createTheme({
  primaryColor: 'brand',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  headings: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
  },
  colors: {
    brand,
  },
  components: {
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        fw: 500,
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
