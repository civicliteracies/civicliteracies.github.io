import { defineMarkdocConfig, nodes, component } from "@astrojs/markdoc/config";
import Markdoc from "@markdoc/markdoc";
import * as shared from "./vendor/markdoc-tags/src/index.ts";

const { Tag } = Markdoc;

/**
 * Extracts plain text from a Markdoc Tag tree's children. Used to flatten
 * inline body content into a single string when a tag's body is just text.
 */
function extractText(children: unknown[]): string {
	const out: string[] = [];
	for (const child of children) {
		if (typeof child === "string") {
			out.push(child);
		} else if (child && typeof child === "object" && "children" in child) {
			out.push(extractText((child as { children: unknown[] }).children));
		}
	}
	return out.join("");
}

const step = {
	render: "div",
	attributes: {
		num: { type: Number, required: true },
		id: { type: String, required: true },
		title: { type: String, required: true },
	},
	transform(node: any, config: any) {
		const attrs = node.transformAttributes(config);
		const children = node.transformChildren(config);
return new Tag(
			"div",
			{ class: "cli-row", id: attrs.id, style: "scroll-margin-top: 5rem;" },
			[
				new Tag("div", { class: "cli-col1" }, [
					new Tag("span", { class: "pipeline-step-num" }, [String(attrs.num)]),
				]),
				new Tag("div", { class: "cli-col2" }, [
					new Tag(
						"h2",
						{ style: "margin: 0 0 0.3em 0; font-size: 1.3rem; font-weight: 700;" },
						[attrs.title],
					),
					...children,
				]),
			],
		);
	},
};

const row = {
	render: "div",
	attributes: {
		prompt: { type: String, required: true },
		dimPrompt: { type: Boolean, default: false },
		style: { type: String },
	},
	transform(node: any, config: any) {
		const attrs = node.transformAttributes(config);
		const children = node.transformChildren(config);
const rowAttrs: Record<string, string> = { class: "cli-row" };
		if (attrs.style) rowAttrs.style = attrs.style;
		const promptAttrs: Record<string, string> = { class: "cli-prompt" };
		if (attrs.dimPrompt) promptAttrs.style = "opacity: 0.5;";
		return new Tag("div", rowAttrs, [
			new Tag("div", { class: "cli-col1" }, [
				new Tag("span", promptAttrs, [attrs.prompt]),
			]),
			new Tag("div", { class: "cli-col2" }, children),
		]);
	},
};

const stepbar = {
	render: "nav",
	attributes: {
		steps: { type: String, required: true },
	},
	transform(node: any, config: any) {
		const attrs = node.transformAttributes(config);
const labels = (attrs.steps as string).split(",").map((s) => s.trim()).filter(Boolean);
		const children: any[] = [];
		labels.forEach((label, i) => {
			const id = label.toLowerCase().replace(/\s+/g, "-");
			children.push(
				new Tag(
					"a",
					{ href: `#${id}`, class: "pipeline-pill", "data-step": id },
					[label],
				),
			);
			if (i < labels.length - 1) {
				children.push(
					new Tag("span", { class: "pipeline-arrow", "aria-hidden": "true" }, ["→"]),
				);
			}
		});
		return new Tag(
			"nav",
			{ class: "pipeline-step-bar", "aria-label": "Pipeline steps" },
			children,
		);
	},
};

const details = {
	render: "details",
	attributes: {
		summary: { type: String, required: true },
	},
	transform(node: any, config: any) {
		const attrs = node.transformAttributes(config);
		const children = node.transformChildren(config);
return new Tag(
			"details",
			{ class: "pipeline-details" },
			[new Tag("summary", {}, [attrs.summary]), ...children],
		);
	},
};

export default defineMarkdocConfig({
	tags: {
		// Shared content tags (cross-project)
		callout: shared.callout,
		chart: shared.chart,
		stats: shared.stats,
		legend: shared.legend,
		pipeline: shared.pipeline,
		quadrant: shared.quadrant,
		"presence-grid": shared.presenceGrid,
		csv: shared.csv,
		fanout: shared.fanout,
		"highlight-prompt": shared.highlightPrompt,
		highlight: shared.highlight,
		// Site-local tags (data-pipeline page)
		step,
		row,
		stepbar,
		details,
	},
	nodes: {
		heading: nodes.heading,
	},
});
