<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { SchemaShell, DynamicPage, NotFoundPage, SchemaErrorPage, schemaLoader, ThemeService } from '@tauri-front/shared';

	let loading = true;
	let error: string | null = null;

	$: currentRoute = $page.url.pathname;
	$: schema = schemaLoader.getSchema();
	$: currentPage = schema?.pages?.find((p: any) => p.route === currentRoute);
	$: layoutRegions = schema?.layoutRegions || [];
	$: layoutMode = currentPage?.layoutMode || 'default';

	onMount(async () => {
		try {
			ThemeService.init();
			await schemaLoader.loadFromUrl('/schemas/unichatschemas.json');
		} catch (e: any) {
			error = e.message;
			console.error('Schema load error:', e);
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
			<p class="text-gray-600 dark:text-gray-400">Loading schema...</p>
		</div>
	</div>
{:else if error}
	<SchemaErrorPage message={error} />
{:else if schema}
	<SchemaShell {layoutRegions} {layoutMode}>
		{#if currentPage}
			<DynamicPage schema={currentPage} />
		{:else}
			<NotFoundPage message="Page not found in schema" />
		{/if}
	</SchemaShell>
{:else}
	<SchemaErrorPage message="No schema loaded" />
{/if}