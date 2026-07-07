import { Routes } from '@angular/router';
import { PagesListComponent } from './pages/pages-list/pages-list.component';

export const routes: Routes = [
  { path: '', component: PagesListComponent },
  { path: '**', redirectTo: '' }
];
