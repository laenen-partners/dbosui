import { CodeHighlight } from '@mantine/code-highlight';

import { tryPrettyJSON } from '../lib/format';

type Props = {
  /** Raw value (possibly base64-encoded JSON from DBOS) — pretty-printed before highlighting. */
  value: string;
  /** Override the language hint (defaults to "json"). */
  language?: string;
};

export function JsonBlock({ value, language = 'json' }: Props) {
  if (!value) return null;
  return (
    <CodeHighlight
      code={tryPrettyJSON(value)}
      language={language}
      withCopyButton={false}
    />
  );
}
