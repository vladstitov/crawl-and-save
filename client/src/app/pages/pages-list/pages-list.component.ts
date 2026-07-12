import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WebPage } from '../page.model';
import { PagesService } from '../pages.service';
import { PageDetailDialogComponent } from '../page-detail-dialog/page-detail-dialog.component';
import { AddPageDialogComponent } from '../add-page-dialog/add-page-dialog.component';

@Component({
  selector: 'app-pages-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule
  ],
  templateUrl: './pages-list.component.html',
  styleUrl: './pages-list.component.scss'
})
export class PagesListComponent implements OnInit {
  readonly displayedColumns = [
    'url',
    'status',
    'pageKind',
    'htmlPageLength',
    'scrapedAt',
    'updated',
    'actions'
  ];

  pages: WebPage[] = [];
  loading = false;
  error: string | null = null;

  constructor(
    private readonly pagesService: PagesService,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.pagesService.getPages().subscribe({
      next: (pages) => {
        this.pages = pages;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error =
          'Could not reach the database API. Is "npm run web" running in app/?';
        this.snackBar.open(this.error, 'Dismiss', { duration: 5000 });
      }
    });
  }

  addPage(): void {
    const dialogRef = this.dialog.open(AddPageDialogComponent, {
      width: '400px'
    });

    dialogRef.afterClosed().subscribe((result: { url: string, clickAction?: string } | undefined) => {
      if (result?.url) {
        this.pagesService.addPage(result.url, result.clickAction).subscribe({
          next: () => {
            this.snackBar.open('URL added successfully', 'Dismiss', { duration: 3000 });
            this.load();
          },
          error: () => {
            this.snackBar.open('Failed to add URL', 'Dismiss', { duration: 3000 });
          }
        });
      }
    });
  }

  editPage(page: WebPage): void {
    const dialogRef = this.dialog.open(AddPageDialogComponent, {
      width: '400px',
      data: { url: page.url, clickAction: page.clickAction }
    });

    dialogRef.afterClosed().subscribe((result: { url: string, clickAction?: string, rescrape?: boolean } | undefined) => {
      const changed = result && (result.url !== page.url || result.clickAction !== page.clickAction);
      if (result && (changed || result.rescrape)) {
        this.pagesService.updatePage(page._id, result.url, result.clickAction, result.rescrape).subscribe({
          next: () => {
            const message = result.rescrape && !changed ? 'Page queued for re-scraping' : 'URL updated successfully';
            this.snackBar.open(message, 'Dismiss', { duration: 3000 });
            this.load();
          },
          error: () => {
            this.snackBar.open('Failed to update URL', 'Dismiss', { duration: 3000 });
          }
        });
      }
    });
  }

  deletePage(page: WebPage): void {
    if (confirm(`Are you sure you want to delete ${page.url}?`)) {
      this.pagesService.deletePage(page._id).subscribe({
        next: () => {
          this.snackBar.open('URL deleted successfully', 'Dismiss', { duration: 3000 });
          this.load();
        },
        error: () => {
          this.snackBar.open('Failed to delete URL', 'Dismiss', { duration: 3000 });
        }
      });
    }
  }

  view(page: WebPage): void {
    this.dialog.open(PageDetailDialogComponent, {
      data: page,
      width: '80vw',
      maxWidth: '900px'
    });
  }
}
