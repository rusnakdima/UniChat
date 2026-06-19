import { Injectable } from "@angular/core";
import { Resolve } from "@angular/router";

@Injectable({ providedIn: "root" })
export class ChatDataResolver implements Resolve<unknown> {
  resolve(): unknown {
    return null;
  }
}
