export interface Source {
  uri: string;
  title: string;
}

export interface Question {
  text: string;
  marks: string | null;
}

export interface Result {
  question: string;
  marks: string | null;
  answer: string;
  imageUrl: string | null;
  sources: Source[];
}

export interface ImagePart {
  data: string; // base64 encoded string
  mimeType: string;
}

export interface ParsedNotes {
  text: string;
  images: ImagePart[];
}
