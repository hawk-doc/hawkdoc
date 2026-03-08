import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 60,
    fontFamily: 'Helvetica',
    fontSize: 12,
    lineHeight: 1.6,
    color: '#37352f',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 24,
    color: '#37352f',
  },
  h1: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 8,
  },
  h2: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 6,
  },
  h3: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 6,
  },
  watermark: {
    position: 'absolute',
    top: '45%',
    left: '10%',
    right: '10%',
    fontSize: 48,
    color: '#e0e0e0',
    textAlign: 'center',
    transform: 'rotate(-30deg)',
    fontFamily: 'Helvetica-Bold',
  },
});

interface Node {
  type: string;
  tag?: string;
  children?: Node[];
  text?: string;
  format?: number;
  src?: string;
  alt?: string;
  variableName?: string;
}

interface EditorRoot {
  root: { children: Node[] };
}

function extractText(node: Node): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'template-variable') return `{{${node.variableName ?? ''}}}`;
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

function renderNode(node: Node, index: number): React.ReactElement | null {
  if (node.type === 'image') {
    if (!node.src) return null;
    return (
      <Image
        key={index}
        src={node.src}
        style={{ maxWidth: '100%', marginVertical: 8 }}
      />
    );
  }

  const text = extractText(node);
  if (!text.trim()) return null;

  switch (node.type) {
    case 'heading': {
      const tag = node.tag ?? 'h1';
      const style =
        tag === 'h1' ? styles.h1 : tag === 'h2' ? styles.h2 : styles.h3;
      return <Text key={index} style={style}>{text}</Text>;
    }
    case 'paragraph':
      return <Text key={index} style={styles.paragraph}>{text}</Text>;
    case 'listitem':
      return <Text key={index} style={styles.paragraph}>• {text}</Text>;
    case 'quote':
      return (
        <View key={index} style={{ borderLeft: '3pt solid #ccc', paddingLeft: 8, marginVertical: 4 }}>
          <Text style={{ ...styles.paragraph, color: '#888' }}>{text}</Text>
        </View>
      );
    default:
      return null;
  }
}

interface DocumentPDFProps {
  editorState: object;
  title: string;
  watermark?: string;
}

export function DocumentPDF({ editorState, title, watermark }: DocumentPDFProps) {
  const root = (editorState as EditorRoot).root;
  const children = root?.children ?? [];

  const allNodes: Node[] = [];
  for (const node of children) {
    if (node.type === 'list' && node.children) {
      allNodes.push(...node.children);
    } else {
      allNodes.push(node);
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {watermark && (
          <Text style={styles.watermark} fixed>
            {watermark}
          </Text>
        )}
        <Text style={styles.title}>{title}</Text>
        {allNodes.map((node, i) => renderNode(node, i))}
      </Page>
    </Document>
  );
}
