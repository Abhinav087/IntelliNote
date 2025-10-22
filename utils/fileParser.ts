import { ParsedNotes, ImagePart } from '../types';

// Declare global variables from CDN scripts
declare const mammoth: any;
declare const pdfjsLib: any;

const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                resolve(event.target.result as ArrayBuffer);
            } else {
                reject(new Error("Failed to read file."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

const parseDocx = async (arrayBuffer: ArrayBuffer): Promise<ParsedNotes> => {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const htmlString = result.value;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    const images: ImagePart[] = [];
    doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('data:')) {
            const [header, data] = src.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            images.push({ data, mimeType });
        }
    });

    return {
        text: doc.body.innerText,
        images: images
    };
};

const imageDataToBase64 = (imageData: any): string => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const data = new Uint8ClampedArray(imageData.width * imageData.height * 4);
    if (imageData.data.length === imageData.width * imageData.height * 3) { // RGB
      let j = 0;
      for (let i = 0; i < imageData.data.length; i += 3) {
        data[j++] = imageData.data[i];
        data[j++] = imageData.data[i + 1];
        data[j++] = imageData.data[i + 2];
        data[j++] = 255; // Alpha
      }
    } else { // RGBA or other
      data.set(imageData.data);
    }

    const canvasImageData = ctx.createImageData(imageData.width, imageData.height);
    canvasImageData.data.set(data);
    ctx.putImageData(canvasImageData, 0, 0);
    
    const [, base64Data] = canvas.toDataURL('image/jpeg').split(',');
    return base64Data;
};


const parsePdf = async (arrayBuffer: ArrayBuffer): Promise<ParsedNotes> => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const images: ImagePart[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // 1. Extract text
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
        
        // 2. Try to extract embedded images
        const opList = await page.getOperatorList();
        const imagePromises: Promise<void>[] = [];
        for (let j = 0; j < opList.fnArray.length; j++) {
            if (opList.fnArray[j] === pdfjsLib.OPS.paintImageXObject) {
                const imgKey = opList.argsArray[j][0];
                // FIX: Handle both sync and async return from get() by wrapping in Promise.resolve()
                const imgPromise = Promise.resolve(page.objs.get(imgKey))
                    .then((imgData: any) => {
                         if (imgData && imgData.data) {
                             const data = imageDataToBase64(imgData);
                             if (data) images.push({ data, mimeType: 'image/jpeg' });
                         }
                    }).catch(e => console.error("Error processing embedded PDF image:", e));
                imagePromises.push(imgPromise);
            }
        }
        await Promise.all(imagePromises);

        // 3. Fallback for scanned pages (if little text is found)
        // Heuristic: if a page has less than 100 characters, it's likely a scan.
        if (pageText.trim().length < 100) {
            try {
                const viewport = page.getViewport({ scale: 1.5 }); // Render at 1.5x resolution for better quality
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // High quality jpeg
                    const [, base64Data] = dataUrl.split(',');
                    if (base64Data) {
                        images.push({ data: base64Data, mimeType: 'image/jpeg' });
                    }
                }
            } catch(e) {
                 console.error("Error rendering PDF page to canvas:", e);
            }
        }
    }

    // De-duplicate images to avoid saving the same image twice if it was extracted and then rendered.
    // Use a substring of the base64 data as a key for efficiency.
    const uniqueImages = Array.from(new Map(images.map(img => [img.data.substring(0, 100), img])).values());

    return { text: fullText, images: uniqueImages };
};

const parseTextFile = async (file: File): Promise<ParsedNotes> => {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ text: e.target?.result as string, images: [] });
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

export const parseNoteFiles = async (files: File[]): Promise<ParsedNotes> => {
    let combinedText = '';
    const allImages: ImagePart[] = [];

    for (const file of files) {
        try {
            let parsed: ParsedNotes;
            const arrayBuffer = await fileToArrayBuffer(file);

            if (file.type === 'application/pdf') {
                parsed = await parsePdf(arrayBuffer);
            } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
                parsed = await parseDocx(arrayBuffer);
            } else {
                 parsed = await parseTextFile(file);
            }
            
            combinedText += parsed.text + '\n\n---\n\n';
            allImages.push(...parsed.images);

        } catch (error) {
            console.error(`Failed to parse file ${file.name}:`, error);
            throw new Error(`Failed to process ${file.name}. It may be corrupted.`);
        }
    }

    return { text: combinedText, images: allImages };
};

export const extractTextFromFile = async (file: File): Promise<string> => {
   const arrayBuffer = await fileToArrayBuffer(file);
    if (file.type === 'application/pdf') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let textContent = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const text = await page.getTextContent();
            textContent += text.items.map((item: any) => item.str).join(' ');
            textContent += '\n';
        }
        return textContent;
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } else {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }
};