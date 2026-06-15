import { Observable } from "rxjs";

export abstract class BaseRepository<T, ID = string> {
  abstract getAll(): Observable<T[]>;
  abstract getById(id: ID): Observable<T | null>;
  abstract create(data: Partial<T>): Observable<T>;
  abstract update(id: ID, data: Partial<T>): Observable<T>;
  abstract delete(id: ID): Observable<void>;
}
