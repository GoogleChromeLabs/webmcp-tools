import { describe, beforeEach, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Home } from './home';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

try {
  TestBed.initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting()
  );
} catch {
  // Already initialized
}

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
