import { CommonModule } from '@angular/common';
import { Component, Inject, Optional } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-page-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './add-page-dialog.component.html',
  styleUrl: './add-page-dialog.component.scss'
})
export class AddPageDialogComponent {
  form;
  isEdit = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<AddPageDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: { url?: string; clickAction?: string } | null
  ) {
    this.isEdit = !!data?.url;
    this.form = this.fb.group({
      url: [data?.url || '', [Validators.required, Validators.pattern(/^https?:\/\/.+/i)]],
      clickAction: [data?.clickAction || ''],
      rescrape: [false]
    });
  }

  submit(): void {
    if (this.form.valid && this.form.value.url) {
      this.dialogRef.close({
        url: this.form.value.url,
        clickAction: this.form.value.clickAction,
        rescrape: this.form.value.rescrape
      });
    }
  }
}
