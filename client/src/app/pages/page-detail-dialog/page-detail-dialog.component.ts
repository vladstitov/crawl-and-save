import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';

import { WebPage } from '../page.model';

@Component({
  selector: 'app-page-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatTabsModule, MatButtonModule],
  templateUrl: './page-detail-dialog.component.html',
  styleUrl: './page-detail-dialog.component.scss'
})
export class PageDetailDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public page: WebPage) {}

  anyLink(link: unknown): any {
    return link as any;
  }

  anyInput(input: unknown): any {
    return input as any;
  }
}
