import { openAIbaseUrl, type SnippetInferenceProvider } from "@huggingface/tasks";
import type { PipelineType, WidgetType } from "@huggingface/tasks/src/pipelines.js";
import type { ChatCompletionInputMessage, GenerationParameters } from "@huggingface/tasks/src/tasks/index.js";
import {
	type InferenceSnippet,
	type ModelDataMinimal,
	getModelInputSnippet,
	stringifyGenerationConfig,
	stringifyMessages,
} from "@huggingface/tasks";

const HFH_INFERENCE_CLIENT_METHODS: Partial<Record<WidgetType, string>> = {
	"audio-classification": "audio_classification",
	"audio-to-audio": "audio_to_audio",
	"automatic-speech-recognition": "automatic_speech_recognition",
	"text-to-speech": "text_to_speech",
	"image-classification": "image_classification",
	"image-segmentation": "image_segmentation",
	"image-to-image": "image_to_image",
	"image-to-text": "image_to_text",
	"object-detection": "object_detection",
	"text-to-image": "text_to_image",
	"text-to-video": "text_to_video",
	"zero-shot-image-classification": "zero_shot_image_classification",
	"document-question-answering": "document_question_answering",
	"visual-question-answering": "visual_question_answering",
	"feature-extraction": "feature_extraction",
	"fill-mask": "fill_mask",
	"question-answering": "question_answering",
	"sentence-similarity": "sentence_similarity",
	summarization: "summarization",
	"table-question-answering": "table_question_answering",
	"text-classification": "text_classification",
	"text-generation": "text_generation",
	"token-classification": "token_classification",
	translation: "translation",
	"zero-shot-classification": "zero_shot_classification",
	"tabular-classification": "tabular_classification",
	"tabular-regression": "tabular_regression",
};

const snippetImportInferenceClient = (accessToken: string, provider: SnippetInferenceProvider): string =>
	`\
from huggingface_hub import InferenceClient

client = InferenceClient(
	provider="${provider}",
	api_key="${accessToken || "{API_TOKEN}"}"
)`;

export const snippetConversational = (
	model: ModelDataMinimal,
	accessToken: string,
	provider: SnippetInferenceProvider,
	providerModelId?: string,
	opts?: {
		streaming?: boolean;
		messages?: ChatCompletionInputMessage[];
		temperature?: GenerationParameters["temperature"];
		max_tokens?: GenerationParameters["max_tokens"];
		top_p?: GenerationParameters["top_p"];
	}
): InferenceSnippet[] => {
	const streaming = opts?.streaming ?? true;
	const exampleMessages = getModelInputSnippet(model) as ChatCompletionInputMessage[];
	const messages = opts?.messages ?? exampleMessages;
	const messagesStr = stringifyMessages(messages, { attributeKeyQuotes: true });

	const config = {
		...(opts?.temperature ? { temperature: opts.temperature } : undefined),
		max_tokens: opts?.max_tokens ?? 500,
		...(opts?.top_p ? { top_p: opts.top_p } : undefined),
	};
	const configStr = stringifyGenerationConfig(config, {
		indent: "\n\t",
		attributeValueConnector: "=",
	});

	if (streaming) {
		return [
			{
				client: "huggingface_hub",
				content: `\
${snippetImportInferenceClient(accessToken, provider)}

messages = ${messagesStr}

stream = client.chat.completions.create(
	model="${model.id}", 
	messages=messages, 
	${configStr}
	stream=True
)

for chunk in stream:
    print(chunk.choices[0].delta.content, end="")`,
			},
			{
				client: "openai",
				content: `\
from openai import OpenAI

client = OpenAI(
	base_url="${openAIbaseUrl(provider)}",
	api_key="${accessToken || "{API_TOKEN}"}"
)

messages = ${messagesStr}

stream = client.chat.completions.create(
    model="${providerModelId ?? model.id}", 
	messages=messages, 
	${configStr}
	stream=True
)

for chunk in stream:
	print(chunk.choices[0].delta.content, end="")`,
			},
		];
	} else {
		return [
			{
				client: "huggingface_hub",
				content: `\
${snippetImportInferenceClient(accessToken, provider)}

messages = ${messagesStr}

completion = client.chat.completions.create(
    model="${model.id}", 
	messages=messages, 
	${configStr}
)

print(completion.choices[0].message)`,
			},
			{
				client: "openai",
				content: `\
from openai import OpenAI

client = OpenAI(
	base_url="${openAIbaseUrl(provider)}",
	api_key="${accessToken || "{API_TOKEN}"}"
)

messages = ${messagesStr}

completion = client.chat.completions.create(
	model="${providerModelId ?? model.id}", 
	messages=messages, 
	${configStr}
)

print(completion.choices[0].message)`,
			},
		];
	}
};

export const snippetZeroShotClassification = (model: ModelDataMinimal): InferenceSnippet[] => {
	return [
		{
			client: "requests",
			content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.json()

output = query({
    "inputs": ${getModelInputSnippet(model)},
    "parameters": {"candidate_labels": ["refund", "legal", "faq"]},
})`,
		},
	];
};

export const snippetZeroShotImageClassification = (model: ModelDataMinimal): InferenceSnippet[] => {
	return [
		{
			client: "requests",
			content: `\
def query(data):
	with open(data["image_path"], "rb") as f:
		img = f.read()
	payload={
		"parameters": data["parameters"],
		"inputs": base64.b64encode(img).decode("utf-8")
	}
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.json()

output = query({
	"image_path": ${getModelInputSnippet(model)},
	"parameters": {"candidate_labels": ["cat", "dog", "llama"]},
})`,
		},
	];
};

export const snippetBasic = (
	model: ModelDataMinimal,
	accessToken: string,
	provider: SnippetInferenceProvider
): InferenceSnippet[] => {
	return [
		...(model.pipeline_tag && model.pipeline_tag in HFH_INFERENCE_CLIENT_METHODS
			? [
					{
						client: "huggingface_hub",
						content: `\
${snippetImportInferenceClient(accessToken, provider)}

result = client.${HFH_INFERENCE_CLIENT_METHODS[model.pipeline_tag]}(
	model="${model.id}",
	inputs=${getModelInputSnippet(model)},
	provider="${provider}",
)

print(result)
`,
					},
			  ]
			: []),
		{
			client: "requests",
			content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.json()
	
output = query({
	"inputs": ${getModelInputSnippet(model)},
})`,
		},
	];
};

export const snippetFile = (model: ModelDataMinimal): InferenceSnippet[] => {
	return [
		{
			client: "requests",
			content: `\
def query(filename):
	with open(filename, "rb") as f:
		data = f.read()
	response = requests.post(API_URL, headers=headers, data=data)
	return response.json()

output = query(${getModelInputSnippet(model)})`,
		},
	];
};

export const snippetTextToImage = (
	model: ModelDataMinimal,
	accessToken: string,
	provider: SnippetInferenceProvider,
	providerModelId?: string
): InferenceSnippet[] => {
	return [
		{
			client: "huggingface_hub",
			content: `\
${snippetImportInferenceClient(accessToken, provider)}

# output is a PIL.Image object
image = client.text_to_image(
	${getModelInputSnippet(model)},
	model="${model.id}"
)`,
		},
		...(provider === "fal-ai"
			? [
					{
						client: "fal-client",
						content: `\
import fal_client

result = fal_client.subscribe(
	"${providerModelId ?? model.id}",
	arguments={
		"prompt": ${getModelInputSnippet(model)},
	},
)
print(result)
`,
					},
			  ]
			: []),
		...(provider === "hf-inference"
			? [
					{
						client: "requests",
						content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.content

image_bytes = query({
	"inputs": ${getModelInputSnippet(model)},
})

# You can access the image with PIL.Image for example
import io
from PIL import Image
image = Image.open(io.BytesIO(image_bytes))`,
					},
			  ]
			: []),
	];
};

export const snippetTextToVideo = (
	model: ModelDataMinimal,
	accessToken: string,
	provider: SnippetInferenceProvider
): InferenceSnippet[] => {
	return ["fal-ai", "replicate"].includes(provider)
		? [
				{
					client: "huggingface_hub",
					content: `\
${snippetImportInferenceClient(accessToken, provider)}

video = client.text_to_video(
	${getModelInputSnippet(model)},
	model="${model.id}"
)`,
				},
		  ]
		: [];
};

export const snippetTabular = (model: ModelDataMinimal): InferenceSnippet[] => {
	return [
		{
			client: "requests",
			content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.content

response = query({
	"inputs": {"data": ${getModelInputSnippet(model)}},
})`,
		},
	];
};

export const snippetTextToAudio = (model: ModelDataMinimal): InferenceSnippet[] => {
	// Transformers TTS pipeline and api-inference-community (AIC) pipeline outputs are diverged
	// with the latest update to inference-api (IA).
	// Transformers IA returns a byte object (wav file), whereas AIC returns wav and sampling_rate.
	if (model.library_name === "transformers") {
		return [
			{
				client: "requests",
				content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.content

audio_bytes = query({
	"inputs": ${getModelInputSnippet(model)},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio_bytes)`,
			},
		];
	} else {
		return [
			{
				client: "requests",
				content: `\
def query(payload):
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.json()
	
audio, sampling_rate = query({
	"inputs": ${getModelInputSnippet(model)},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio, rate=sampling_rate)`,
			},
		];
	}
};

export const snippetDocumentQuestionAnswering = (model: ModelDataMinimal): InferenceSnippet[] => {
	return [
		{
			client: "requests",
			content: `\
def query(payload):
	with open(payload["image"], "rb") as f:
		img = f.read()
		payload["image"] = base64.b64encode(img).decode("utf-8")  
	response = requests.post(API_URL, headers=headers, json=payload)
	return response.json()

output = query({
    "inputs": ${getModelInputSnippet(model)},
})`,
		},
	];
};

export const pythonSnippets: Partial<
	Record<
		PipelineType,
		(
			model: ModelDataMinimal,
			accessToken: string,
			provider: SnippetInferenceProvider,
			providerModelId?: string,
			opts?: Record<string, unknown>
		) => InferenceSnippet[]
	>
> = {
	// Same order as in tasks/src/pipelines.ts
	"text-classification": snippetBasic,
	"token-classification": snippetBasic,
	"table-question-answering": snippetBasic,
	"question-answering": snippetBasic,
	"zero-shot-classification": snippetZeroShotClassification,
	translation: snippetBasic,
	summarization: snippetBasic,
	"feature-extraction": snippetBasic,
	"text-generation": snippetBasic,
	"text2text-generation": snippetBasic,
	"image-text-to-text": snippetConversational,
	"fill-mask": snippetBasic,
	"sentence-similarity": snippetBasic,
	"automatic-speech-recognition": snippetFile,
	"text-to-image": snippetTextToImage,
	"text-to-video": snippetTextToVideo,
	"text-to-speech": snippetTextToAudio,
	"text-to-audio": snippetTextToAudio,
	"audio-to-audio": snippetFile,
	"audio-classification": snippetFile,
	"image-classification": snippetFile,
	"tabular-regression": snippetTabular,
	"tabular-classification": snippetTabular,
	"object-detection": snippetFile,
	"image-segmentation": snippetFile,
	"document-question-answering": snippetDocumentQuestionAnswering,
	"image-to-text": snippetFile,
	"zero-shot-image-classification": snippetZeroShotImageClassification,
};

export function getPythonInferenceSnippet(
	model: ModelDataMinimal,
	accessToken: string,
	provider: SnippetInferenceProvider,
	providerModelId?: string,
	opts?: Record<string, unknown>
): InferenceSnippet[] {
	if (model.tags.includes("conversational")) {
		// Conversational model detected, so we display a code snippet that features the Messages API
		return snippetConversational(model, accessToken, provider, providerModelId, opts);
	} else {
		const snippets =
			model.pipeline_tag && model.pipeline_tag in pythonSnippets
				? pythonSnippets[model.pipeline_tag]?.(model, accessToken, provider, providerModelId) ?? []
				: [];

		return snippets.map((snippet) => {
			return {
				...snippet,
				content:
					snippet.client === "requests"
						? `\
import requests

API_URL = "${openAIbaseUrl(provider)}"
headers = {"Authorization": ${accessToken ? `"Bearer ${accessToken}"` : `f"Bearer {API_TOKEN}"`}}

${snippet.content}`
						: snippet.content,
			};
		});
	}
}
