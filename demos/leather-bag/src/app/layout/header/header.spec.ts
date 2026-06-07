import { describe, beforeEach, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Header } from './header';
import { provideRouter } from '@angular/router';
describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
