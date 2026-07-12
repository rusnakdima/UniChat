import { Injectable, inject } from "@angular/core";
import { InvokeWrapperService, SchemaRouterService, UiSchema } from "@tauri-front/shared";
import { Response } from "@tauri-front/shared";

export interface SchemaResponse {
  _id: string;
  name: string;
  version: string;
  pages: unknown[];
  layouts: unknown[];
  components: unknown[];
  metadata: unknown;
}

@Injectable({ providedIn: "root" })
export class SchemaService {
  private readonly api = inject(InvokeWrapperService);
  private readonly schemaRouter = inject(SchemaRouterService);

  async loadSchema(id: string = "unichat-schema"): Promise<boolean> {
    try {
      const response = await this.api.invoke<Response<SchemaResponse>>("get_schema", { id });
      if (response?.data) {
        const schema = {
          version: response.data.version || "1.0",
          pages: response.data.pages as Array<{ id: string; route?: string }>,
          layouts: response.data.layouts as Array<{ id: string; type: string }>,
        };
        this.schemaRouter.setSchema(schema as UiSchema);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to load schema:", error);
      return false;
    }
  }

  async saveSchema(
    id: string,
    name: string,
    version: string,
    pages: unknown[],
    layouts: unknown[],
    components: unknown[],
    metadata: unknown
  ): Promise<boolean> {
    try {
      await this.api.invoke<Response<unknown>>("save_schema", {
        id,
        name,
        version,
        pages,
        layouts,
        components,
        metadata,
      });
      return true;
    } catch (error) {
      console.error("Failed to save schema:", error);
      return false;
    }
  }

  async getAllSchemas(): Promise<SchemaResponse[]> {
    const response =
      await this.api.invoke<Response<{ schemas: SchemaResponse[] }>>("get_all_schemas");
    return response?.data?.schemas ?? [];
  }

  async deleteSchema(id: string): Promise<boolean> {
    try {
      await this.api.invoke<Response<unknown>>("delete_schema", { id });
      return true;
    } catch (error) {
      console.error("Failed to delete schema:", error);
      return false;
    }
  }
}
