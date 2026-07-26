<script lang="ts">
	import { Card, Button } from '@tauri-front/shared';
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome to UniChat</h1>
		<p class="text-gray-600 dark:text-gray-400">Schema-driven unified chat application</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
		<Card>
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-2">Chat Channels</h2>
				<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
					Connect to your favorite chat platforms in one unified interface.
				</p>
				<Button variant="primary">Connect</Button>
			</div>
		</Card>

		<Card>
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-2">Settings</h2>
				<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
					Configure platform connections and notification preferences.
				</p>
				<Button variant="secondary">Configure</Button>
			</div>
		</Card>
	</div>
</div>
