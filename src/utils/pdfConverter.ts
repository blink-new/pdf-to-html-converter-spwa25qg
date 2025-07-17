import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker with proper fallback handling
const configureWorker = () => {
  try {
    // Use CDN worker URL that matches the installed version (5.3.93)
    const cdnWorkerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.93/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;
    console.log('PDF.js worker configured with CDN:', cdnWorkerSrc);
  } catch (error) {
    console.warn('Could not configure PDF worker with CDN, trying local fallback:', error);
    
    // Fallback to local path
    try {
      const fallbackWorkerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
      pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackWorkerSrc;
      console.log('PDF.js worker fallback configured:', fallbackWorkerSrc);
    } catch (fallbackError) {
      console.warn('Could not configure PDF worker fallback:', fallbackError);
      // Disable worker completely if all configurations fail
      pdfjsLib.GlobalWorkerOptions.workerSrc = null;
    }
  }
};

// Initialize worker configuration when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configureWorker);
  } else {
    configureWorker();
  }
} else {
  // Server-side rendering fallback
  configureWorker();
}

export interface ConversionResult {
  html: string;
  images: string[];
  styles: string;
  metadata: {
    title: string;
    pageCount: number;
    fileSize: string;
  };
}

export interface ConversionProgress {
  step: string;
  progress: number;
}

export class PDFConverter {
  private onProgress?: (progress: ConversionProgress) => void;

  constructor(onProgress?: (progress: ConversionProgress) => void) {
    this.onProgress = onProgress;
  }

  async convertPDFToHTML(file: File): Promise<ConversionResult> {
    let originalBuffer: ArrayBuffer;
    
    try {
      originalBuffer = await file.arrayBuffer();
    } catch (error) {
      console.error('Failed to read file as ArrayBuffer:', error);
      throw new Error('Failed to read PDF file. Please check if the file is valid.');
    }
    
    // Validate that the buffer is not detached
    if (originalBuffer.byteLength === 0) {
      throw new Error('PDF file appears to be empty or corrupted.');
    }
    
    // Create a copy of the ArrayBuffer to prevent detachment issues
    // This ensures the buffer remains accessible even if PDF.js transfers it to a worker
    const fileBuffer = originalBuffer.slice(0);
    
    // Configure PDF.js with proper options and worker fallback
    const loadingTask = pdfjsLib.getDocument({
      data: fileBuffer,
      // Try to use worker, but allow fallback
      disableWorker: false,
      // Add error handling for worker issues
      verbosity: 0, // Reduce verbose logging
      // Remove cMapUrl for now to avoid additional loading issues
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.93/standard_fonts/'
    });
    
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      console.warn('PDF loading failed with worker, trying without worker:', error);
      
      // Retry without worker if worker fails
      // Create another copy for the fallback attempt
      // Validate the original buffer is still valid
      if (originalBuffer.byteLength === 0) {
        throw new Error('PDF buffer became invalid during processing. Please try again.');
      }
      
      const fallbackBuffer = originalBuffer.slice(0);
      const fallbackTask = pdfjsLib.getDocument({
        data: fallbackBuffer,
        disableWorker: true,
        verbosity: 0
      });
      
      try {
        pdf = await fallbackTask.promise;
      } catch (fallbackError) {
        console.error('PDF loading failed completely:', fallbackError);
        throw new Error('Failed to load PDF document. Please check if the file is valid and try again.');
      }
    }
    
    this.reportProgress('Loading PDF document', 10);
    
    const metadata = {
      title: file.name,
      pageCount: pdf.numPages,
      fileSize: (file.size / 1024).toFixed(2) + ' KB'
    };

    let htmlContent = '';
    let cssStyles = '';
    const extractedImages: string[] = [];

    // Generate base CSS
    cssStyles = this.generateBaseCSS();
    
    this.reportProgress('Extracting pages', 20);

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      this.reportProgress(`Processing page ${pageNum}`, 20 + (pageNum / pdf.numPages) * 60);
      
      const page = await pdf.getPage(pageNum);
      const pageHTML = await this.convertPageToHTML(page, pageNum);
      htmlContent += pageHTML;
    }

    this.reportProgress('Finalizing HTML', 90);

    // Generate final HTML
    const finalHTML = this.generateFinalHTML(htmlContent, cssStyles, metadata.title);
    
    this.reportProgress('Conversion complete', 100);

    return {
      html: finalHTML,
      images: extractedImages,
      styles: cssStyles,
      metadata
    };
  }

  private async convertPageToHTML(page: any, pageNum: number): Promise<string> {
    const viewport = page.getViewport({ scale: 1.5 });
    const textContent = await page.getTextContent();
    
    let pageHTML = `<div class="page page-${pageNum}" style="width: ${viewport.width}px; height: ${viewport.height}px; position: relative; margin: 20px auto; border: 1px solid #ddd; background: white; page-break-after: always;">\n`;

    // Process text content
    const textItems = textContent.items;
    for (const item of textItems) {
      if (item.str && item.str.trim()) {
        const transform = item.transform;
        const x = transform[4];
        const y = viewport.height - transform[5]; // Flip Y coordinate
        const fontSize = Math.abs(transform[0]);
        const fontFamily = this.extractFontFamily(item.fontName);
        
        // Try to detect if text is bold or italic
        const isBold = item.fontName && (item.fontName.includes('Bold') || item.fontName.includes('bold'));
        const isItalic = item.fontName && (item.fontName.includes('Italic') || item.fontName.includes('italic'));
        
        let fontWeight = isBold ? 'bold' : 'normal';
        let fontStyle = isItalic ? 'italic' : 'normal';
        
        pageHTML += `  <div class="text-item" style="position: absolute; left: ${x}px; top: ${y}px; font-size: ${fontSize}px; font-family: ${fontFamily}; font-weight: ${fontWeight}; font-style: ${fontStyle}; white-space: pre;">${this.escapeHtml(item.str)}</div>\n`;
      }
    }

    // Try to extract images
    try {
      const operatorList = await page.getOperatorList();
      const imageOps = operatorList.fnArray.filter((fn: any) => fn === pdfjsLib.OPS.paintImageXObject);
      if (imageOps.length > 0) {
        pageHTML += `  <div class="image-placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 20px; background: rgba(240, 240, 240, 0.8); border: 2px dashed #999; text-align: center; border-radius: 8px; color: #666;">\n`;
        pageHTML += `    <div style="font-size: 14px; margin-bottom: 5px;">📷 ${imageOps.length} image(s) detected</div>\n`;
        pageHTML += `    <div style="font-size: 12px; color: #888;">(Image extraction in progress)</div>\n`;
        pageHTML += `  </div>\n`;
      }
    } catch (error) {
      console.warn('Could not extract images from page', pageNum, error);
    }

    pageHTML += `</div>\n`;
    return pageHTML;
  }

  private extractFontFamily(fontName: string | undefined): string {
    if (!fontName) return 'Arial, sans-serif';
    
    // Common font mappings
    const fontMap: { [key: string]: string } = {
      'Arial': 'Arial, sans-serif',
      'Times': 'Times New Roman, serif',
      'Helvetica': 'Helvetica, Arial, sans-serif',
      'Courier': 'Courier New, monospace',
      'Symbol': 'Symbol, serif',
      'Verdana': 'Verdana, sans-serif',
      'Georgia': 'Georgia, serif',
      'Palatino': 'Palatino, serif',
      'Trebuchet': 'Trebuchet MS, sans-serif',
      'Comic': 'Comic Sans MS, cursive'
    };
    
    // Find matching font
    for (const [key, value] of Object.entries(fontMap)) {
      if (fontName.includes(key)) {
        return value;
      }
    }
    
    // Default fallback
    return 'Arial, sans-serif';
  }

  private generateBaseCSS(): string {
    return `
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
        background: #f5f5f5;
        color: #333;
      }
      .page {
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        margin-bottom: 30px;
      }
      .text-item {
        line-height: 1.1;
        color: inherit;
      }
      .image-placeholder {
        font-family: Arial, sans-serif;
        user-select: none;
      }
      .table {
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
      }
      .table th, .table td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      .table th {
        background-color: #f2f2f2;
      }
      @media print {
        .page {
          box-shadow: none;
          margin: 0;
          break-inside: avoid;
        }
        body {
          background: white;
          padding: 0;
        }
      }
    `;
  }

  private generateFinalHTML(content: string, styles: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
${styles}
    </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private reportProgress(step: string, progress: number) {
    if (this.onProgress) {
      this.onProgress({ step, progress });
    }
  }
}