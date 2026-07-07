import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { WebPage } from './page.model';

// The Express API in app/src/web-server.ts (npm run web), listening on 8766.
const API_BASE = 'http://localhost:8766';

@Injectable({ providedIn: 'root' })
export class PagesService {
  constructor(private readonly http: HttpClient) {}

  getPages(): Observable<WebPage[]> {
    return this.http.get<WebPage[]>(`${API_BASE}/pages`);
  }

  getPage(id: string): Observable<WebPage> {
    return this.http.get<WebPage>(`${API_BASE}/pages/${id}`);
  }

  addPage(url: string, clickAction?: string): Observable<WebPage> {
    return this.http.post<WebPage>(`${API_BASE}/pages`, { url, clickAction });
  }

  updatePage(id: string, url: string, clickAction?: string): Observable<WebPage> {
    return this.http.put<WebPage>(`${API_BASE}/pages/${id}`, { url, clickAction });
  }

  deletePage(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/pages/${id}`);
  }
}
