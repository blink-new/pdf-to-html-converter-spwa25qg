import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Progress } from './components/ui/progress'
import { Alert, AlertDescription } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Separator } from './components/ui/separator'
import { Upload, Download, FileText, Code, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { PDFConverter, ConversionResult, ConversionProgress } from './utils/pdfConverter'

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileSelect = useCallback((file: File) => {
    if (file.type === 'application/pdf') {
      setSelectedFile(file)
      setError(null)
      setConversionResult(null)
    } else {
      setError('Please select a valid PDF file')
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const [currentStep, setCurrentStep] = useState<string>('')

  const convertPDF = useCallback(async () => {
    if (!selectedFile) return

    setIsConverting(true)
    setProgress(0)
    setError(null)
    setCurrentStep('')

    try {
      const converter = new PDFConverter((progressInfo: ConversionProgress) => {
        setProgress(progressInfo.progress)
        setCurrentStep(progressInfo.step)
      })

      const result = await converter.convertPDFToHTML(selectedFile)
      setConversionResult(result)
    } catch (err) {
      console.error('Conversion error:', err)
      setError('Conversion failed. Please try again with a different PDF file.')
    } finally {
      setIsConverting(false)
      setProgress(0)
      setCurrentStep('')
    }
  }, [selectedFile])

  const downloadHTML = useCallback(() => {
    if (!conversionResult) return

    const blob = new Blob([conversionResult.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedFile?.name.replace('.pdf', '')}_converted.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [conversionResult, selectedFile])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-6xl p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">PDF to HTML Converter</h1>
          <p className="text-slate-600">Convert PDF files to HTML with exact styling preservation</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  Upload PDF File
                </CardTitle>
                <CardDescription>
                  Select a PDF file to convert to HTML with preserved styling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragOver
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2">
                    Drag and drop a PDF file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input">
                    <Button variant="outline" className="cursor-pointer">
                      Browse Files
                    </Button>
                  </label>
                </div>

                {selectedFile && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{selectedFile.name}</p>
                        <p className="text-sm text-slate-500">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      <Badge variant="secondary">PDF</Badge>
                    </div>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {isConverting && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-slate-600">
                        {currentStep || 'Converting PDF...'}
                      </span>
                    </div>
                    <Progress value={progress} className="w-full" />
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <Button
                    onClick={convertPDF}
                    disabled={!selectedFile || isConverting}
                    className="flex-1"
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Converting...
                      </>
                    ) : (
                      <>
                        <Code className="w-4 h-4 mr-2" />
                        Convert to HTML
                      </>
                    )}
                  </Button>
                  {conversionResult && (
                    <Button onClick={downloadHTML} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Download HTML
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">Exact Styling</p>
                    <p className="text-sm text-slate-600">Preserves fonts, colors, and positioning</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">Image Extraction</p>
                    <p className="text-sm text-slate-600">Extracts and positions images correctly</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">Table Structure</p>
                    <p className="text-sm text-slate-600">Maintains rowspan and colspan properties</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">List Formatting</p>
                    <p className="text-sm text-slate-600">Preserves bullet points and numbering</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {conversionResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Conversion Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">File Name</p>
                    <p className="text-sm text-slate-600">{conversionResult.metadata.title}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Page Count</p>
                    <p className="text-sm text-slate-600">{conversionResult.metadata.pageCount}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">File Size</p>
                    <p className="text-sm text-slate-600">{conversionResult.metadata.fileSize}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Images Found</p>
                    <p className="text-sm text-slate-600">{conversionResult.images.length}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Results Section */}
        {conversionResult && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Conversion Results</CardTitle>
              <CardDescription>
                Preview of the converted HTML output
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">HTML Preview</TabsTrigger>
                  <TabsTrigger value="code">HTML Code</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="space-y-4">
                  <div className="border rounded-lg p-4 bg-white">
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: conversionResult.html }}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="code" className="space-y-4">
                  <div className="border rounded-lg p-4 bg-slate-900 text-slate-100 overflow-x-auto">
                    <pre className="text-sm">
                      <code>{conversionResult.html}</code>
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default App