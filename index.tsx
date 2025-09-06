/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// NOTE: The API key is sourced from `process.env.API_KEY` in alignment with secure practices.
// This environment variable is assumed to be configured in the execution environment.

import { GoogleGenAI, Part, Modality } from '@google/genai';

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element Selection ---
  const fileInput = document.getElementById('room_image') as HTMLInputElement;
  const dropArea = document.getElementById('drop-area') as HTMLLabelElement;
  const imagePreviewContainer = document.getElementById(
    'image-preview-container',
  ) as HTMLDivElement;
  const stylePromptInput = document.getElementById(
    'style_prompt',
  ) as HTMLInputElement;
  const generateButton = document.getElementById(
    'generate-button',
  ) as HTMLButtonElement;
  const outputImageContainer = document.getElementById(
    'output-image-container',
  ) as HTMLDivElement;
  const outputImage = document.getElementById('output_image') as HTMLImageElement;
  const outputPlaceholder = outputImageContainer.querySelector('p');

  if (
    !fileInput ||
    !dropArea ||
    !imagePreviewContainer ||
    !stylePromptInput ||
    !generateButton ||
    !outputImageContainer ||
    !outputImage ||
    !outputPlaceholder
  ) {
    console.error('One or more required elements were not found in the DOM.');
    return;
  }

  // --- File Uploader Code ---
  const preventDefaults = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const highlight = () => dropArea.classList.add('highlight');
  const unhighlight = () => dropArea.classList.remove('highlight');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropArea.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  const handleDrop = (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (dt) {
      const files = dt.files;
      if (files.length > 0) {
        fileInput.files = files;
        handleFiles(files);
      }
    }
  };

  dropArea.addEventListener('drop', handleDrop, false);

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files) {
      handleFiles(files);
    }
  };

  fileInput.addEventListener('change', handleFileSelect, false);

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (file && file.type.startsWith('image/')) {
      previewFile(file);
    } else {
      alert('Please select an image file.');
    }
  };

  const previewFile = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      imagePreviewContainer.innerHTML = ''; // Clear previous preview
      const img = document.createElement('img');
      img.src = reader.result as string;
      img.alt = 'Preview of the uploaded room image.';
      imagePreviewContainer.appendChild(img);
    };
  };

  // --- Virtual Stager AI Logic ---

  const fileToGenerativePart = async (file: File): Promise<Part> => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };

  const runRedesigner = async () => {
    // Ensure API key is available
    if (!process.env.API_KEY) {
      alert('API key is not configured. Please set the environment variable.');
      return;
    }

    const file = fileInput.files?.[0];
    const stylePrompt = stylePromptInput.value;

    if (!file) {
      alert('Please upload an image first.');
      return;
    }
    if (!stylePrompt) {
      alert('Please enter a desired style.');
      return;
    }

    // Update UI to loading state
    generateButton.disabled = true;
    outputImage.style.display = 'none';
    outputPlaceholder.textContent = '✨ Generating your new room... Please wait.';
    outputPlaceholder.style.display = 'block';

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const imagePart = await fileToGenerativePart(file);

      // *** THIS IS THE FINAL "MASKING" PROMPT ***
      const textPart: Part = {
        text: `
          You are a photoshop expert AI. Your task is to perform an inpainting-style edit on the provided image.

          **The Mask:** The "editable" area of the image is all furniture, the floor, the rug, and the walls.
  
          **The Unchanged Area:** The "uneditable" area is the window, the window frame, the light coming from the window, and the ceiling. You MUST NOT change these parts. Preserve them exactly as they are in the original image.
  
          **The Task:** Within the "editable" area only, redesign the room to match this style: "${stylePrompt}"
        `,
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
          parts: [imagePart, textPart],
        },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      let base64Image: string | undefined;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }

      // Display the result
      if (base64Image) {
        outputPlaceholder.style.display = 'none';
        outputImage.src = `data:image/jpeg;base64,${base64Image}`;
        outputImage.alt = `Redesigned room in the style of ${stylePrompt}`;
        outputImage.style.display = 'block';
      } else {
        throw new Error('The model did not return an image. Please try again.');
      }
    } catch (error: any) {
      console.error('Error generating image:', error);
      outputPlaceholder.textContent = `Sorry, an error occurred: ${error.message}`;
      outputPlaceholder.style.display = 'block';
      outputImage.style.display = 'none';
    } finally {
      generateButton.disabled = false;
    }
  };

  generateButton.addEventListener('click', runRedesigner);
});