<script lang="ts">
	import { page } from '$app/stores';
	import { schemaLoader, DynamicPage, NotFoundPage, SchemaErrorPage } from '@tauri-front/shared';

	$: currentRoute = $page.url.pathname;
	$: schema = schemaLoader.getSchema();
	$: currentPage = schema?.pages?.find((p: any) => p.route === currentRoute);
</script>

{#if schema && currentPage}
	<DynamicPage schema={currentPage} />
{:else if schema}
	<NotFoundPage message="Page not found in schema" />
{:else}
	<SchemaErrorPage message="Schema not loaded" />
{/if}