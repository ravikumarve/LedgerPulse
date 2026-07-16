import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";

describe("App", () => {
  it("renders the dashboard heading", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.getByText("LedgerPulse")).toBeInTheDocument();
    expect(
      screen.getByText("Supply Chain Reconciliation & Tax Engine")
    ).toBeInTheDocument();
  });
});
