<script lang="ts">
    import TextField from "../controls/TextField.svelte";
    import { createEventDispatcher, onMount } from "svelte";
    import type { InputResponse } from "../messages/InputResponse";
    import type { InputField } from "../messages/InputField";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import CheckWidget from "../controls/CheckWidget.svelte";
    import ModalDialog from "./ModalDialog.svelte";
    import SelectWidget from "../controls/SelectWidget.svelte";

    type FieldType = "text" | "password" | "url" | "select" | "check";

    function getType(field: InputField): FieldType {
        if (field.choices.length === 2 && field.choices.includes("true") && field.choices.includes("false")) {
            return "check";
        } else if (field.choices.length > 1) {
            return "select";
        } else if (field.label.toLowerCase().includes("password")) {
            return "password";
        } else if (
            field.label.toLowerCase().includes("repository") ||
            field.label.toLowerCase().includes("destination")
        ) {
            return "url";
        } else {
            return "text";
        }
    }

    interface $$Events {
        response: CustomEvent<InputResponse | null>;
    }

    export let title: string;
    export let detail: String;
    export let fields: InputField[];

    let dispatch = createEventDispatcher();

    onMount(() => {
        if (fields[0]) document.getElementById(`field-${fields[0].label}`)?.focus();
        else document.querySelector<HTMLButtonElement>("#dialog-commands button:last-child")?.focus();
    });

    function onCancel() {
        dispatch("response", null);
    }

    function onEnter() {
        let responseFields: Record<string, string> = {};
        for (let field of fields) {
            switch (getType(field)) {
                case "text":
                case "password":
                case "url":
                    let textInput = document.getElementById(`field-${field.label}`) as HTMLInputElement;
                    responseFields[field.label] = textInput.value;
                    break;
                case "select":
                    let selectInput = document.getElementById(`field-${field.label}`) as HTMLSelectElement;
                    responseFields[field.label] = selectInput.value;
                    break;
                case "check":
                    let checkInput = document.getElementById(`field-${field.label}`) as HTMLInputElement;
                    responseFields[field.label] = checkInput.checked ? "true" : "false";
                    break;
            }
        }

        dispatch("response", {
            fields: responseFields,
        });
    }
</script>

<ModalDialog {title} onCancel={onCancel} onDefault={onEnter}>
    {#if detail != ""}
        {#if detail.startsWith("code:")}
            <p><code>{detail.slice(5)}</code></p>
        {:else}
            <p>{detail}</p>
        {/if}
    {/if}
    {#each fields as field}
        <label for="field-{field.label}">{field.label}{field.label.endsWith(":") ? "" : ":"}</label>
        {#if getType(field) == "text"}
            <TextField
                id="field-{field.label}"
                type="text"
                autocapitalize="off"
                autocorrect="off"
                autocomplete="off"
                spellcheck="false"
                value={field.choices.length == 1 ? field.choices[0] : ""} />
        {:else if getType(field) == "password"}
            <TextField id="field-{field.label}" type="password" />
        {:else if getType(field) == "url"}
            <TextField
                id="field-{field.label}"
                type="url"
                autocapitalize="off"
                autocorrect="off"
                autocomplete="off"
                spellcheck="false"
                value={field.choices.length == 1 ? field.choices[0] : ""} />
        {:else if getType(field) == "select"}
            <SelectWidget
                id="field-{field.label}"
                label={field.label}
                value={field.choices[0]}
                options={field.choices.map((c) => ({ label: c, value: c }))} />
        {:else if getType(field) == "check"}
            <span><CheckWidget id="field-{field.label}" checked={field.choices[0] == "true"} /></span>
        {/if}
    {/each}
    {#snippet commands()}
        {#if fields.length}<ActionWidget safe secondary onClick={onCancel}>Cancel</ActionWidget>{/if}
        <ActionWidget safe primary onClick={onEnter}>{fields.length ? "Enter" : "OK"}</ActionWidget>
    {/snippet}
</ModalDialog>

<style>
    p { grid-column: 1 / -1; overflow-wrap: anywhere; }
    p:has(code) { padding: 10px 12px; border: 1px solid var(--rule); border-radius: var(--radius-control); background: var(--surface); }
    label { color: var(--muted); font-size: 13px; }
</style>
