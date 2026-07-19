import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";

describe("App", () => {
  it("renders the landing page at /", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Landing page hero text
    expect(screen.getByText("Supply Chain Reconciliation.")).toBeInTheDocument();
  });

  it("shows the landing page CTA", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.getByText("Explore The Engine")).toBeInTheDocument();
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });
});
