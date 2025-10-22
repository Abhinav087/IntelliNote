import { Result } from '../types';

// Declare global variables from CDN scripts
declare const marked: any;
declare const jspdf: any;
declare const docx: any;

// --- HELPER FUNCTIONS ---

const createBlobAndDownload = (content: string | Blob, fileName: string, type: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const base64ToBuffer = (base64: string): ArrayBuffer => {
    const binaryStr = atob(base64.split(',')[1]);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
};

const stripMarkdown = (md: string): string => {
    // This is a simplified stripper, mainly for TXT export.
    // It will remove most markdown but leave tables messy.
    md = md.replace(/^#{1,6}\s+(.*)/gm, '$1');
    md = md.replace(/(\*\*|__)(.*?)\1/g, '$2');
    md = md.replace(/(\*|_)(.*?)\1/g, '$2');
    md = md.replace(/\[(.*?)\]\(.*?\)/g, '$1');
    md = md.replace(/!\[(.*?)\]\(.*?\)/g, '');
    md = md.replace(/^-{3,}/gm, '');
    md = md.replace(/^>\s?/gm, '');
    md = md.replace(/^\s*[-*+]\s+/gm, '- ');
    md = md.replace(/^\s*\d+\.\s+/gm, (match) => `${match.trim()} `);
    md = md.replace(/`([^`]+)`/g, '$1');
    md = md.replace(/```[\s\S]*?```/g, '');
    // Simple table conversion to text
    md = md.replace(/\|/g, ' | ').replace(/---\s*\|/g, '---|');
    return md.trim();
};


// --- DOWNLOAD HANDLERS ---

const downloadHtml = (results: Result[]) => {
    const resultsHtml = results.map((r, i) => {
        const answerHtml = marked.parse(r.answer);
        const sourcesHtml = r.sources.map(s => `<li><a href="${s.uri}" target="_blank" rel="noopener noreferrer">${s.title || s.uri}</a></li>`).join('');
        
        return `
            <article class="result">
                <h2>Q${i + 1}: ${r.question} ${r.marks ? `<span>(${r.marks})</span>` : ''}</h2>
                <div class="answer">${answerHtml}</div>
                ${r.imageUrl ? `<img src="${r.imageUrl}" alt="AI generated for '${r.question}'" style="max-width: 500px; border-radius: 8px; margin-top: 1rem;">` : ''}
                ${sourcesHtml ? `
                    <div class="sources">
                        <h4>Web Sources</h4>
                        <ul>${sourcesHtml}</ul>
                    </div>
                ` : ''}
            </article>
        `;
    }).join('');

    const content = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>IntelliNote Q&A Results</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #eee; background-color: #1e293b; margin: 0; padding: 2rem; }
                .container { max-width: 800px; margin: auto; }
                h1 { color: #67e8f9; }
                .result { background-color: #334155; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #475569; }
                .result h2 { margin-top: 0; color: #67e8f9; }
                .result h2 span { font-size: 0.9rem; color: #94a3b8; font-weight: normal; }
                .answer { color: #cbd5e1; }
                .answer p { margin: 0 0 1em; }
                .answer ul { padding-left: 20px; list-style-type: disc; }
                .answer li { margin-bottom: 0.5em; }
                .answer code { background-color: #475569; padding: 0.2em 0.4em; border-radius: 4px; font-family: "Courier New", Courier, monospace; }
                .answer pre { background-color: #475569; padding: 1em; border-radius: 4px; overflow-x: auto; }
                .answer table { width: 100%; border-collapse: collapse; margin: 1em 0; }
                .answer th, .answer td { border: 1px solid #94a3b8; padding: 0.5em 0.75em; text-align: left; }
                .answer th { background-color: #475569; font-weight: bold; }
                .sources { margin-top: 1.5rem; border-top: 1px solid #475569; padding-top: 1rem; }
                .sources h4 { margin-top: 0; color: #cbd5e1; }
                .sources ul { padding-left: 20px; margin: 0; list-style-type: disc;}
                .sources a { color: #c084fc; text-decoration: none; }
                .sources a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>IntelliNote Q&A Results</h1>
                ${resultsHtml}
            </div>
        </body>
        </html>
    `;
    createBlobAndDownload(content, 'IntelliNote_Q&A.html', 'text/html');
};

const downloadTxt = (results: Result[]) => {
    const content = results.map((r, i) => `Q${i + 1}: ${r.question} ${r.marks ? `(${r.marks})` : ''}\n\nAnswer:\n${stripMarkdown(r.answer)}\n\nSources:\n${r.sources.map(s => `- ${s.title}: ${s.uri}`).join('\n')}\n\n---\n\n`).join('');
    createBlobAndDownload(content, 'IntelliNote_Q&A.txt', 'text/plain');
};

const downloadMd = (results: Result[]) => {
    const content = results.map((r, i) => `## Q${i + 1}: ${r.question} ${r.marks ? `*(${r.marks})*` : ''}\n\n${r.answer}\n\n**Sources:**\n${r.sources.map(s => `* [${s.title || s.uri}](${s.uri})`).join('\n')}\n\n---\n\n`).join('');
    createBlobAndDownload(content, 'IntelliNote_Q&A.md', 'text/markdown');
};

const downloadPdf = async (results: Result[]) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ unit: 'pt' });
    const docWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 0;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('IntelliNote Q&A Results', docWidth / 2, y + 50, { align: 'center' });
    y = 80;

    for (const [index, result] of results.entries()) {
        if (y > doc.internal.pageSize.getHeight() - 150 && index > 0) {
            doc.addPage();
            y = 40;
        }

        if (result.marks) {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`(${result.marks})`, docWidth / 2, y, { align: 'center' });
            y += 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 0, 0);
        const questionLines = doc.splitTextToSize(`Q${index + 1}: ${result.question}`, docWidth - margin * 2);
        doc.text(questionLines, margin, y);
        y += questionLines.length * 12 + 15;
        doc.setTextColor(0, 0, 0);

        const tokens = marked.lexer(result.answer);
        const lineHeight = 12;

        for (const token of tokens) {
            if (y > doc.internal.pageSize.getHeight() - 60) {
                doc.addPage();
                y = 40;
            }

            if (token.type === 'space') {
                y += lineHeight;
                continue;
            }

            if (token.type === 'table') {
                doc.setFont('helvetica', 'normal');
                const header = token.header.map((cell: any) => cell.text);
                const rows = token.rows.map((row: any) => row.map((cell: any) => cell.text));
                const colCount = header.length;
                const availableWidth = docWidth - margin * 2;
                const colWidths = Array(colCount).fill(availableWidth / colCount);
                const tableCellPadding = 5;

                const getRowHeight = (row: string[], fontStyle: 'bold' | 'normal') => {
                    let maxHeight = 0;
                    doc.setFont('helvetica', fontStyle);
                    row.forEach((cell, i) => {
                        const textLines = doc.splitTextToSize(cell, colWidths[i] - tableCellPadding * 2);
                        maxHeight = Math.max(maxHeight, textLines.length * lineHeight);
                    });
                    return maxHeight + tableCellPadding * 2;
                };

                const headerHeight = getRowHeight(header, 'bold');
                if (y + headerHeight > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
                
                doc.setFont('helvetica', 'bold');
                let currentX = margin;
                header.forEach((cell, i) => {
                    doc.rect(currentX, y, colWidths[i], headerHeight, 'S');
                    doc.text(cell, currentX + tableCellPadding, y + tableCellPadding + 10, { maxWidth: colWidths[i] - tableCellPadding * 2 });
                    currentX += colWidths[i];
                });
                y += headerHeight;

                doc.setFont('helvetica', 'normal');
                rows.forEach((row: string[]) => {
                    const rowHeight = getRowHeight(row, 'normal');
                    if (y + rowHeight > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
                    currentX = margin;
                    row.forEach((cell, i) => {
                        doc.rect(currentX, y, colWidths[i], rowHeight, 'S');
                        doc.text(cell, currentX + tableCellPadding, y + tableCellPadding + 10, { maxWidth: colWidths[i] - tableCellPadding * 2 });
                        currentX += colWidths[i];
                    });
                    y += rowHeight;
                });
                y += 10;
                continue;
            }

            if (token.type === 'list') {
                doc.setFont('helvetica', 'normal');
                token.items.forEach((item: any) => {
                    const textLines = doc.splitTextToSize(item.text, docWidth - margin * 2 - 15);
                    if (y + textLines.length * lineHeight > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
                    doc.text('\u2022', margin, y);
                    doc.text(textLines, margin + 15, y);
                    y += textLines.length * lineHeight + 4;
                });
                y += 10;
                continue;
            }

            if ('text' in token && (token as any).text) {
                doc.setFont('helvetica', (token as any).type === 'heading' ? 'bold' : 'normal');
                const textLines = doc.splitTextToSize((token as any).text.trim(), docWidth - margin * 2);
                if (y + textLines.length * lineHeight > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
                doc.text(textLines, margin, y);
                y += textLines.length * lineHeight + 10;
            }
        }
        y += 20;
    }
    doc.save('IntelliNote_Q&A.pdf');
};


const downloadDocx = async (results: Result[]) => {
    const children: any[] = [];
    
    children.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: "IntelliNote Q&A Results", bold: true, size: 48 })],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 400 },
    }));

    for (const result of results) {
        if (result.marks) {
            children.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: `(${result.marks})`, bold: true, size: 28 })],
                alignment: docx.AlignmentType.CENTER,
                spacing: { after: 200 },
            }));
        }

        children.push(new docx.Paragraph({
            children: [new docx.TextRun({ text: result.question, bold: true, color: "FF0000", size: 24 })],
            spacing: { after: 200 },
        }));
        
        stripMarkdown(result.answer).split('\n').forEach(line => {
             const isListItem = /^\s*[-*+]\s+/.test(line);
             const lineText = line.replace(/^\s*[-*+]\s+/, '').trim();
             if(lineText) {
                children.push(new docx.Paragraph({ 
                    text: lineText,
                    bullet: isListItem ? { level: 0 } : undefined,
                }));
             }
        });

        if (result.imageUrl) {
            try {
                const imageBuffer = base64ToBuffer(result.imageUrl);
                children.push(new docx.Paragraph({
                    children: [new docx.ImageRun({
                        data: imageBuffer,
                        transformation: { width: 400, height: 300 },
                    })],
                    alignment: docx.AlignmentType.CENTER,
                }));
            } catch (e) { console.error("Could not add image to DOCX", e); }
        }

        if (result.sources.length > 0) {
            children.push(new docx.Paragraph({ text: "Sources:", bold: true, spacing: { before: 200 } }));
            result.sources.forEach(source => {
                children.push(new docx.Paragraph({
                    children: [new docx.ExternalHyperlink({
                        children: [new docx.TextRun({ text: source.title || source.uri, style: "Hyperlink" })],
                        link: source.uri,
                    })],
                }));
            });
        }
        children.push(new docx.Paragraph({ text: "\n---\n", spacing: { after: 200, before: 200 } }));
    }

    const doc = new docx.Document({ 
        styles: {
            paragraphStyles: [{
                id: "Hyperlink",
                name: "Hyperlink",
                basedOn: "Normal",
                next: "Normal",
                run: { color: "0000FF", underline: {} },
            }]
        },
        sections: [{ properties: {}, children }]
    });
    const blob = await docx.Packer.toBlob(doc);
    createBlobAndDownload(blob, 'IntelliNote_Q&A.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
};

// --- MAIN EXPORT ---

export const generateAndDownloadFile = (
  results: Result[],
  format: 'html' | 'txt' | 'md' | 'pdf' | 'docx'
) => {
  if (!results || results.length === 0) return;

  switch (format) {
    case 'html': downloadHtml(results); break;
    case 'txt': downloadTxt(results); break;
    case 'md': downloadMd(results); break;
    case 'pdf': downloadPdf(results); break;
    case 'docx': downloadDocx(results); break;
  }
};